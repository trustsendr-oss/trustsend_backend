import { test } from '@japa/runner'
import { randomUUID, createHmac } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import CardDepositSession from '#models/card_deposit_session'
import LedgerEntry from '#models/ledger_entry'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import {
  GoFreshPayRequestException,
  type CardGateway,
  type ChargeResult,
  type EnrollResult,
  type PaymentStatusResult,
} from '#services/card_payments/gofreshpay_gateway'
import { GoFreshPaySignature } from '#services/card_payments/gofreshpay_signature'
import {
  CardDepositException,
  CardDepositService,
} from '#services/card_payments/card_deposit_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

const json = (res: { body(): unknown }) => res.body() as any

const CALLBACK_SECRET = 'test-callback-secret'
const BILLING = {
  addressLine1: 'Av. Kasa-Vubu 42',
  addressCity: 'Kinshasa',
  addressCountry: 'CD',
  phoneNumber: '+243812345001',
}

/**
 * A GoFreshPay that answers what each test tells it to, and records what it was asked. Charges
 * are counted: a top-up must never be charged — or credited — twice.
 */
class FakeGateway implements CardGateway {
  readonly name = 'gofreshpay'
  enrollResult: EnrollResult = { status: 'AUTHENTICATED', authenticationTransactionId: 'auth-1' }
  chargeResult: ChargeResult | Error = {
    status: 'SUCCESS',
    gatewayTransactionId: 'cs-1',
    reasonCode: null,
    message: null,
  }
  statusResult: PaymentStatusResult = {
    status: 'SUCCESS',
    message: null,
    cardType: 'Visa',
    cardLast4: '3172',
    cardIssuer: 'Equity Bank',
    cardScheme: 'VISA DEBIT',
    cardBinCountry: 'CD',
  }
  charges = 0

  async captureContext() {
    return {
      jwt: 'capture.jwt.token',
      transactionUuid: `FP-${randomUUID()}`,
      expiresInSeconds: 900,
    }
  }
  async paSetup() {
    return {
      referenceId: 'ref-1',
      accessToken: 'ddc-jwt',
      deviceDataCollectionUrl: 'https://centinelapi.cardinalcommerce.com/V1/Cruise/Collect',
    }
  }
  async paEnroll() {
    return this.enrollResult
  }
  async charge() {
    this.charges += 1
    if (this.chargeResult instanceof Error) throw this.chargeResult
    return this.chargeResult
  }
  async paymentStatus() {
    return this.statusResult
  }
}

async function startTopUp(gateway: FakeGateway, amount = 5_000n, balance = 0n) {
  const { user, wallet } = await createUserWithWallet({
    email: `card-${randomUUID()}@test.com`,
    balance,
  })
  const { session, checkoutToken } = await CardDepositService.createSession(gateway, {
    user,
    amount: new Money(amount, 'USD'),
    correlationId: `test-${randomUUID()}`,
  })
  return { user, wallet, session, checkoutToken }
}

/** Runs the checkout up to the end of 3DS, as the page would. */
async function payFrictionless(gateway: FakeGateway, session: CardDepositSession) {
  await CardDepositService.setup(gateway, session, 'transient-token-abcdefghijklmnop')
  const result = await CardDepositService.enroll(gateway, session, {
    transientToken: 'transient-token-abcdefghijklmnop',
    referenceId: 'ref-1',
    billing: BILLING,
  })
  if (result.next !== 'done') throw new Error('expected a frictionless 3DS')
  return result.session
}

function signedWebhook(body: Record<string, unknown>, secret = CALLBACK_SECRET) {
  // The client sends `.json(body)`, i.e. exactly these bytes.
  const raw = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret)
    .update(timestamp + raw)
    .digest('hex')
  return { raw, body, header: `t=${timestamp},v1=${signature}` }
}

async function postedRowFor(trackingId: string) {
  const tracking = await LedgerTransaction.findOrFail(trackingId)
  const postedId = (tracking.metadata as any)?.posted_transaction_id
  return { tracking, postedId: postedId as string | undefined }
}

test.group('Card top-ups (GoFreshPay Microform)', (group) => {
  group.setup(async () => {
    const previousSecret = env.get('GOFRESHPAY_CALLBACK_SECRET')
    env.set('GOFRESHPAY_CALLBACK_SECRET', CALLBACK_SECRET)
    // Amounts below are checked without a fee; the fee has its own test.
    const fee = await db.from('fee_schedules').where('operation_type', 'card_deposit').first()
    await db
      .from('fee_schedules')
      .where('operation_type', 'card_deposit')
      .update({ fee_percent: 0 })
    return async () => {
      env.set('GOFRESHPAY_CALLBACK_SECRET', (previousSecret ?? '') as any)
      await db
        .from('fee_schedules')
        .where('operation_type', 'card_deposit')
        .update({ fee_percent: fee?.fee_percent ?? 0 })
    }
  })

  test('the migration seeds a card_deposit fee schedule', async ({ assert }) => {
    const row = await db.from('fee_schedules').where('operation_type', 'card_deposit').first()
    assert.exists(row)
  })

  test('starting a checkout writes a session and an audit row, but nothing to the ledger', async ({
    assert,
  }) => {
    const gateway = new FakeGateway()
    const { user, session } = await startTopUp(gateway)

    assert.equal(session.status, 'created')
    assert.isNotNull(session.gatewayTransactionUuid)
    assert.notExists(session.ledgerTransactionId)
    assert.notInclude(JSON.stringify(session.serialize()), session.checkoutTokenHash)

    const ledgerRows = await LedgerTransaction.query()
      .where('type', 'card_deposit')
      .where('initiated_by_id', user.id)
    assert.lengthOf(ledgerRows, 0)

    const audit = await db
      .from('audit_logs')
      .where('action', 'card_deposit.session.created')
      .where('resource_id', session.id)
      .first()
    assert.exists(audit)
  })

  test('refuses currencies GoFreshPay does not take, and amounts under its minimum', async ({
    assert,
  }) => {
    const gateway = new FakeGateway()
    const { user } = await createUserWithWallet({ email: `card-${randomUUID()}@test.com` })

    await assert.rejects(
      () =>
        CardDepositService.createSession(gateway, {
          user,
          amount: new Money(5_000n, 'BIF'),
          correlationId: 'test',
        }),
      /only available in USD and CDF/
    )
    await assert.rejects(
      () =>
        CardDepositService.createSession(gateway, {
          user,
          amount: new Money(99n, 'USD'),
          correlationId: 'test',
        }),
      /smallest card top-up/
    )
  })

  test('a frictionless payment is credited once, with a balanced double entry', async ({
    assert,
  }) => {
    const gateway = new FakeGateway()
    const { wallet, session } = await startTopUp(gateway, 5_000n, 1_000n)

    const settled = await payFrictionless(gateway, session)
    assert.equal(settled.status, 'completed')
    assert.equal(gateway.charges, 1)

    const { tracking, postedId } = await postedRowFor(settled.ledgerTransactionId!)
    assert.equal(tracking.status, 'completed')
    assert.equal(tracking.paymentMethod, 'card')
    assert.equal(tracking.amount, 5_000n)
    assert.exists(postedId)

    const entries = await LedgerEntry.query().where('ledger_transaction_id', postedId!)
    const debits = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount, 0n)
    const credits = entries
      .filter((e) => e.direction === 'credit')
      .reduce((s, e) => s + e.amount, 0n)
    assert.equal(debits, 5_000n)
    assert.equal(credits, 5_000n)

    const clearing = await db
      .from('ledger_accounts')
      .where('code', 'CARD_CLEARING.USD')
      .select('id')
      .first()
    assert.exists(clearing)
    assert.isTrue(entries.some((e) => e.ledgerAccountId === clearing.id && e.direction === 'debit'))

    const after = await Wallet.findOrFail(wallet.id)
    assert.equal(after.balanceCache, 6_000n)

    const events = await db
      .from('outbox_events')
      .where('aggregate_id', tracking.id)
      .orderBy('id')
      .select('event_type')
    assert.deepEqual(
      events.map((e) => e.event_type),
      ['card_deposit.initiated', 'card_deposit.completed']
    )

    const actions = await db
      .from('audit_logs')
      .where('resource_id', tracking.id)
      .orderBy('id')
      .select('action')
    assert.deepEqual(
      actions.map((a) => a.action),
      ['transaction.card_deposit.initiated', 'transaction.card_deposit.completed']
    )
  })

  test('the receipt opens from the id the notification quotes, for its owner only', async ({
    assert,
    client,
  }) => {
    const gateway = new FakeGateway()
    const { user, session } = await startTopUp(gateway, 5_000n)
    const settled = await payFrictionless(gateway, session)
    const { tracking, postedId } = await postedRowFor(settled.ledgerTransactionId!)

    // The notification carries the tracking row's id; the statement only lists the posted row.
    const byTracking = await client.get(`/api/v1/transactions/${tracking.id}`).loginAs(user)
    assert.equal(byTracking.status(), 200)
    assert.equal((byTracking.body() as any).data.id, postedId)
    assert.equal((byTracking.body() as any).data.direction, 'in')
    const byUuid = await client.get(`/api/v1/transactions/${tracking.uuid}`).loginAs(user)
    assert.equal((byUuid.body() as any).data.id, postedId)

    const { user: stranger } = await createUserWithWallet({
      email: `card-${randomUUID()}@test.com`,
    })
    const blocked = await client.get(`/api/v1/transactions/${tracking.id}`).loginAs(stranger)
    assert.equal(blocked.status(), 404)
  })

  test('the webhook and the sweep arriving after the charge credit nothing more', async ({
    assert,
    client,
  }) => {
    const gateway = new FakeGateway()
    const { wallet, session } = await startTopUp(gateway, 2_500n)
    const settled = await payFrictionless(gateway, session)

    const signed = signedWebhook({
      status: 'SUCCESS',
      decision: 'ACCEPT',
      transaction_uuid: settled.gatewayTransactionUuid,
      amount: '25.00',
      currency: 'USD',
      card_type: 'Visa',
      card_last4: '3172',
      card_scheme: 'VISA DEBIT',
      card_issuer: 'Equity Bank',
      card_bin_country: 'CD',
    })
    const response = await client
      .post('/api/v1/webhooks/gofreshpay')
      .header('x-freshpay-signature', signed.header)
      .json(signed.body)
    response.assertStatus(200)

    // Charging again (double tap) must not reach the gateway.
    await CardDepositService.charge(gateway, settled, 'transient-token-abcdefghijklmnop')
    await CardDepositService.settle(settled.gatewayTransactionUuid!, {
      status: 'SUCCESS',
      source: 'reconciliation',
      cardType: null,
      cardLast4: null,
      cardIssuer: null,
      cardScheme: null,
      cardBinCountry: null,
    })

    assert.equal(gateway.charges, 1)
    const after = await Wallet.findOrFail(wallet.id)
    assert.equal(after.balanceCache, 2_500n)

    const posted = await LedgerTransaction.query()
      .where('type', 'card_deposit')
      .where('related_transaction_id', settled.ledgerTransactionId!)
    assert.lengthOf(posted, 1)

    // The webhook brought the card details the charge response lacks.
    const refreshed = await CardDepositSession.findOrFail(session.id)
    assert.equal(refreshed.cardLast4, '3172')
    assert.equal(refreshed.cardScheme, 'VISA DEBIT')
  })

  test('a lost charge answer leaves the top-up pending, and the sweep settles it once', async ({
    assert,
  }) => {
    const gateway = new FakeGateway()
    gateway.chargeResult = new GoFreshPayRequestException('timeout', 'unknown')
    const { wallet, session } = await startTopUp(gateway, 4_000n)

    const pending = await payFrictionless(gateway, session)
    assert.equal(pending.status, 'charging')
    const tracking = await LedgerTransaction.findOrFail(pending.ledgerTransactionId!)
    assert.equal(tracking.status, 'processing')
    assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 0n)

    // Past the grace period the sweep asks GoFreshPay directly.
    await db
      .from('card_deposit_sessions')
      .where('id', session.id)
      .update({ updated_at: new Date(Date.now() - 10 * 60_000) })
    await CardDepositService.sweep(gateway)
    await CardDepositService.sweep(gateway)

    const settled = await CardDepositSession.findOrFail(session.id)
    assert.equal(settled.status, 'completed')
    assert.equal(settled.cardLast4, '3172')
    assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 4_000n)
    assert.equal(gateway.charges, 1)
  })

  test('a declined charge fails the top-up without touching the balance', async ({ assert }) => {
    const gateway = new FakeGateway()
    gateway.chargeResult = {
      status: 'FAILED',
      gatewayTransactionId: null,
      reasonCode: '481',
      message: 'Non 3Ds Reject',
    }
    const { wallet, session } = await startTopUp(gateway, 3_000n, 700n)

    const failed = await payFrictionless(gateway, session)
    assert.equal(failed.status, 'failed')
    assert.equal(failed.failureCode, '481')

    const tracking = await LedgerTransaction.findOrFail(failed.ledgerTransactionId!)
    assert.equal(tracking.status, 'failed')
    assert.isNull(tracking.relatedTransactionId)
    assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 700n)

    const failedEvent = await db
      .from('outbox_events')
      .where('aggregate_id', tracking.id)
      .where('event_type', 'card_deposit.failed')
      .first()
    assert.exists(failedEvent)
  })

  test('a failed 3DS ends the checkout before any charge or ledger row', async ({ assert }) => {
    const gateway = new FakeGateway()
    gateway.enrollResult = { status: 'FAILED', reasonCode: '476', message: 'Authentication failed' }
    const { session } = await startTopUp(gateway)

    const failed = await payFrictionless(gateway, session)
    assert.equal(failed.status, 'failed')
    assert.equal(failed.failureCode, '476')
    assert.notExists(failed.ledgerTransactionId)
    assert.equal(gateway.charges, 0)
  })

  test('a 3DS challenge waits for the OTP, then charges', async ({ assert }) => {
    const gateway = new FakeGateway()
    gateway.enrollResult = {
      status: 'CHALLENGE_REQUIRED',
      authenticationTransactionId: 'auth-2',
      stepUpUrl: 'https://centinelapi.cardinalcommerce.com/V2/Cruise/StepUp',
      accessToken: 'stepup-jwt',
    }
    const { wallet, session } = await startTopUp(gateway, 1_500n)

    await CardDepositService.setup(gateway, session, 'transient-token-abcdefghijklmnop')
    const result = await CardDepositService.enroll(gateway, session, {
      transientToken: 'transient-token-abcdefghijklmnop',
      referenceId: 'ref-1',
      billing: BILLING,
    })
    assert.equal(result.next, 'challenge')
    assert.equal(session.status, 'challenge')
    assert.equal(gateway.charges, 0)

    const settled = await CardDepositService.charge(
      gateway,
      session,
      'transient-token-abcdefghijklmnop'
    )
    assert.equal(settled.status, 'completed')
    assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 1_500n)
  })

  test('takes the scheduled fee, and books it as platform revenue', async ({ assert }) => {
    await db
      .from('fee_schedules')
      .where('operation_type', 'card_deposit')
      .update({ fee_percent: 2 })
    try {
      const gateway = new FakeGateway()
      const { wallet, session } = await startTopUp(gateway, 10_000n)
      const settled = await payFrictionless(gateway, session)

      const { tracking, postedId } = await postedRowFor(settled.ledgerTransactionId!)
      assert.equal(tracking.fee, 200n)
      assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 9_800n)

      const fees = await db.from('ledger_accounts').where('code', 'PLATFORM_FEES.USD').first()
      const feeEntry = await LedgerEntry.query()
        .where('ledger_transaction_id', postedId!)
        .where('ledger_account_id', fees.id)
        .firstOrFail()
      assert.equal(feeEntry.direction, 'credit')
      assert.equal(feeEntry.amount, 200n)
    } finally {
      await db
        .from('fee_schedules')
        .where('operation_type', 'card_deposit')
        .update({ fee_percent: 0 })
    }
  })

  test('a success reported for another amount is not credited', async ({ assert }) => {
    const gateway = new FakeGateway()
    gateway.chargeResult = new GoFreshPayRequestException('timeout', 'unknown')
    const { wallet, session } = await startTopUp(gateway, 5_000n)
    const pending = await payFrictionless(gateway, session)

    const after = await CardDepositService.settle(pending.gatewayTransactionUuid!, {
      status: 'SUCCESS',
      amountMajor: '500.00',
      currencyCode: 'USD',
      source: 'webhook',
      cardType: null,
      cardLast4: null,
      cardIssuer: null,
      cardScheme: null,
      cardBinCountry: null,
    })
    assert.equal(after.status, 'charging')
    assert.exists(after.metadata.amount_mismatch)
    assert.equal((await Wallet.findOrFail(wallet.id)).balanceCache, 0n)
  })

  test('the webhook refuses a bad signature and ignores unknown transactions', async ({
    client,
  }) => {
    const bad = signedWebhook({ status: 'SUCCESS', transaction_uuid: 'FP-x' }, 'wrong-secret')
    const rejected = await client
      .post('/api/v1/webhooks/gofreshpay')
      .header('x-freshpay-signature', bad.header)
      .json(bad.body)
    rejected.assertStatus(401)

    const unknown = signedWebhook({
      status: 'SUCCESS',
      decision: 'ACCEPT',
      transaction_uuid: 'FP-unknown',
    })
    const ignored = await client
      .post('/api/v1/webhooks/gofreshpay')
      .header('x-freshpay-signature', unknown.header)
      .json(unknown.body)
    ignored.assertStatus(200)
    ignored.assertBodyContains({ ignored: true })
  })

  test('the checkout API only answers with the session token', async ({ assert, client }) => {
    const gateway = new FakeGateway()
    const { session, checkoutToken } = await startTopUp(gateway, 5_000n)

    const anonymous = await client.get(`/api/v1/card-checkout/${session.id}`)
    anonymous.assertStatus(404)
    const wrong = await client
      .get(`/api/v1/card-checkout/${session.id}`)
      .header('x-checkout-token', 'not-the-token')
    wrong.assertStatus(404)

    const ok = await client
      .get(`/api/v1/card-checkout/${session.id}`)
      .header('x-checkout-token', checkoutToken)
    ok.assertStatus(200)
    const data = json(ok).data
    assert.equal(data.status, 'created')
    assert.equal(data.currency_code, 'USD')
    assert.equal(data.capture_context, 'capture.jwt.token')
    assert.notProperty(data, 'checkout_token_hash')
  })

  test('serves the checkout page, and a 3DS return page its parent can frame', async ({
    assert,
    client,
  }) => {
    const id = randomUUID()
    const page = await client.get(`/card-checkout/${id}`)
    page.assertStatus(200)
    assert.include(page.text(), 'cs-number')
    assert.equal(page.header('cache-control'), 'no-store')

    const back = await client.post(`/card-checkout/${id}/3ds-return`).form({ MD: id, ECI: '05' })
    back.assertStatus(200)
    assert.equal(back.header('x-frame-options'), 'SAMEORIGIN')
    assert.include(back.text(), '3ds-complete')
  })

  test('the sweep closes checkouts abandoned before any charge', async ({ assert }) => {
    const gateway = new FakeGateway()
    const { session } = await startTopUp(gateway)
    await db
      .from('card_deposit_sessions')
      .where('id', session.id)
      .update({ expires_at: new Date(Date.now() - 60_000) })

    await CardDepositService.sweep(gateway)
    const expired = await CardDepositSession.findOrFail(session.id)
    assert.equal(expired.status, 'expired')

    await assert.rejects(
      () => CardDepositService.setup(gateway, expired, 'transient-token-abcdefghijklmnop'),
      CardDepositException as any
    )
  })

  test('signature helpers match GoFreshPay’s documented schemes', async ({ assert }) => {
    const body = '{"amount":1}'
    const ts = '2026-10-27T10:00:00.000+00:00'
    assert.equal(
      GoFreshPaySignature.signRequest('secret', body, ts),
      createHmac('sha256', 'secret')
        .update(body + ts)
        .digest('hex')
    )
    const { raw, header } = signedWebhook({ a: 1 })
    assert.isTrue(GoFreshPaySignature.verifyWebhook(CALLBACK_SECRET, header, raw))
    assert.isFalse(GoFreshPaySignature.verifyWebhook(CALLBACK_SECRET, header, raw + ' '))
    assert.isFalse(GoFreshPaySignature.verifyWebhook(CALLBACK_SECRET, 't=1,v1=abc', raw))
  })
})
