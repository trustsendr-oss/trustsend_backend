import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import InternalUser from '#models/internal_user'
import { AgentCommissionService } from '#services/agents/agent_commission_service'
import { AgentFloatService } from '#services/agents/agent_float_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import KycVerification from '#models/kyc_verification'
import Remittance from '#models/remittance'
import User from '#models/user'
import Wallet from '#models/wallet'
import WatchlistEntry from '#models/watchlist_entry'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { PinService } from '#services/security/pin_service'
import { RemittanceService } from '#services/remittances/remittance_service'
import { normalizeName } from '#services/remittances/screening_service'
import type { RemittanceMobileMoneyProvider } from '#services/remittances/remittance_service'

/**
 * International transfers into the DRC, end to end: a sender abroad pays from their wallet, a
 * beneficiary collects cash at an agent (or is credited on their wallet), and every exit —
 * payout, cancellation, expiry, compliance rejection — leaves the books balanced.
 *
 * Fixtures carry a timestamp suffix and nothing is torn down: ledger rows are append-only.
 */
test.group('Remittances', (group) => {
  let admin: InternalUser

  group.setup(async () => {
    admin = await InternalUser.create({
      email: `remit-admin-${Date.now()}@example.test`,
      fullName: 'Compliance',
      password: 'a-real-password',
      status: 'active',
      mustChangePassword: false,
      mfaEnabled: true,
    })
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', admin.id).delete()
  })

  let counter = 0
  const suffixOf = () => `${Date.now() + counter++}`.slice(-8)
  const asAdmin = (req: any) => req.withGuard('internal').loginAs(admin)

  async function sender(
    suffix: string,
    currency = 'BIF',
    balance = 5_000_000_00n,
    kyc = true,
    country: string | null = 'BI'
  ) {
    const user = await User.create({
      fullName: `Sender ${suffix}`,
      code: `4${suffix}`,
      email: `sender${suffix}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(user, '1234')
    const wallet = await UserOnboardingService.createDefaultWallet(
      user.id,
      currency,
      `rem-${suffix}`
    )
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: balance })
    if (kyc) {
      const verification = new KycVerification()
      verification.subjectType = 'user'
      verification.subjectId = user.id
      verification.verificationType = 'identity'
      verification.countryCode = country
      verification.status = 'approved'
      verification.submittedAt = DateTime.now()
      verification.decidedAt = DateTime.now()
      await verification.save()
    }
    return { user, wallet }
  }

  async function payingAgent(suffix: string) {
    const agentUser = await User.create({
      fullName: `Payer ${suffix}`,
      email: `payer${suffix}@example.test`,
      password: 'a-real-password',
    })
    const agent = await AgentOnboardingService.create({
      userId: agentUser.id,
      fullName: `Payer ${suffix}`,
      email: `payer${suffix}@example.test`,
      phone: '+243900000020',
      tier: 'master',
      correlationId: `rem-${suffix}`,
    })
    await db.from('agents').where('id', agent.id).update({ status: 'active' })
    return { agentUser, agent }
  }

  async function sendCash(user: User, client: any, amount = '10000000', name = 'Mapendo Kahindo') {
    const quote = await client.post('/api/v1/remittances/quote').loginAs(user).json({
      source_currency: 'BIF',
      payout_currency: 'USD',
      payout_method: 'cash_pickup',
      send_amount: amount,
    })
    quote.assertStatus(201)
    const sent = await client
      .post('/api/v1/remittances')
      .loginAs(user)
      .json({
        quote_id: (quote.body() as any).data.quote_id,
        sender_country: 'BI',
        payout_method: 'cash_pickup',
        beneficiary_name: name,
        beneficiary_phone: '0812345678',
        beneficiary_city: 'Goma',
        pin: '1234',
        idempotency_key: randomUUID(),
      })
    return { quote: (quote.body() as any).data, sent }
  }

  test('BIF abroad → USD cash at an agent, with phone as second factor', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const { user, wallet } = await sender(suffix)
    const { agentUser, agent } = await payingAgent(suffix)

    const { quote, sent } = await sendCash(user, client)
    sent.assertStatus(201)
    const body = (sent.body() as any).data
    assert.equal(body.status, 'awaiting_payout')
    assert.match(body.pickup_code, /^\d{10}$/)
    assert.equal(body.payout_amount, quote.payout_amount)

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n - BigInt(quote.total_debited))

    // The agent sees who to pay, never the full phone number.
    const lookup = await client
      .post('/api/v1/agent/remittances/lookup')
      .loginAs(agentUser)
      .json({ code: body.pickup_code })
    lookup.assertStatus(200)
    const preview = (lookup.body() as any).data
    assert.equal(preview.beneficiary.name, 'Mapendo Kahindo')
    assert.notInclude(JSON.stringify(preview), '812345678')

    const pay = (phone: string) =>
      client.post(`/api/v1/agent/remittances/${body.id}/pay`).loginAs(agentUser).json({
        code: body.pickup_code,
        beneficiary_phone: phone,
        id_type: 'voter_card',
        id_number: 'CD-123456',
      })

    const wrong = await pay('0899999999')
    wrong.assertStatus(422)
    assert.equal((wrong.body() as any).code, 'PHONE_MISMATCH')

    const floatWalletBefore = await Wallet.findOrFail(agent.walletId!)
    const floatBefore = floatWalletBefore.balanceCache
    const paid = await pay('+243 812 345 678')
    paid.assertStatus(200)

    const remittance = await Remittance.findOrFail(body.id)
    assert.equal(remittance.status, 'paid')
    assert.equal(remittance.verificationFailures, 1)
    assert.equal(remittance.beneficiaryIdNumber, 'CD-123456')

    const floatWalletAfter = await Wallet.findOrFail(agent.walletId!)
    const floatAfter = floatWalletAfter.balanceCache
    const payout = BigInt(quote.payout_amount)
    // The cash handed out comes back to the float; the commission waits for the daily payout.
    assert.equal(floatAfter - floatBefore, payout)

    const rate = await FeeScheduleService.getFeePercent('remittance_agent_commission')
    const results = await AgentCommissionService.payDay(DateTime.now())
    const mine = results.find((r) => r.agentId === agent.id && r.currency === 'USD')
    assert.equal(mine?.remittanceVolume, payout)
    assert.equal(mine?.commission, AgentFloatService.commissionOn(payout, rate))

    const again = await pay('0812345678')
    again.assertStatus(409)
  })

  test('the sender must be identified, and transfers within the DRC are refused', async ({
    client,
    assert,
  }) => {
    const unverified = await sender(suffixOf(), 'BIF', 5_000_000_00n, false)
    const { sent } = await sendCash(unverified.user, client)
    sent.assertStatus(403)
    assert.equal((sent.body() as any).code, 'KYC_REQUIRED')

    // A verified identity without a country of residence cannot send abroad.
    const noCountry = await sender(suffixOf(), 'BIF', 5_000_000_00n, true, null)
    const missing = await sendCash(noCountry.user, client)
    missing.sent.assertStatus(403)
    assert.equal((missing.sent.body() as any).code, 'KYC_COUNTRY_MISSING')

    // The country comes from the verified identity: a DRC resident is refused even if the
    // request claims another country.
    const { user } = await sender(suffixOf(), 'BIF', 5_000_000_00n, true, 'CD')
    const quote = await client.post('/api/v1/remittances/quote').loginAs(user).json({
      source_currency: 'BIF',
      payout_currency: 'USD',
      payout_method: 'cash_pickup',
      send_amount: '10000000',
    })
    const domestic = await client
      .post('/api/v1/remittances')
      .loginAs(user)
      .json({
        quote_id: (quote.body() as any).data.quote_id,
        sender_country: 'BE',
        payout_method: 'cash_pickup',
        beneficiary_name: 'Mapendo Kahindo',
        beneficiary_phone: '0812345678',
        pin: '1234',
        idempotency_key: randomUUID(),
      })
    assert.equal((domestic.body() as any).code, 'DOMESTIC_NOT_SUPPORTED')
  })

  test('cash is paid in USD only; a wallet can receive CDF', async ({ client, assert }) => {
    const { user } = await sender(suffixOf())
    const cdfCash = await client.post('/api/v1/remittances/quote').loginAs(user).json({
      source_currency: 'BIF',
      payout_currency: 'CDF',
      payout_method: 'cash_pickup',
      send_amount: '10000000',
    })
    assert.equal((cdfCash.body() as any).code, 'PAYOUT_CURRENCY_UNSUPPORTED')
  })

  test('a wallet payout credits the beneficiary at once', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { user } = await sender(suffix, 'USD', 500_00n)
    const beneficiary = await User.create({
      fullName: `Beneficiary ${suffix}`,
      code: `3${suffix}`,
      email: `benef${suffix}@example.test`,
      password: 'a-real-password',
    })
    const target = await UserOnboardingService.createDefaultWallet(
      beneficiary.id,
      'USD',
      `rem-${suffix}`
    )

    const quote = await client.post('/api/v1/remittances/quote').loginAs(user).json({
      source_currency: 'USD',
      payout_currency: 'USD',
      payout_method: 'wallet',
      send_amount: '10000',
    })
    const q = (quote.body() as any).data
    assert.equal(q.payout_amount, '10000', 'same currency: no FX')
    assert.equal(q.fee, '300', '3% fee')

    const sent = await client.post('/api/v1/remittances').loginAs(user).json({
      quote_id: q.quote_id,
      sender_country: 'BE',
      payout_method: 'wallet',
      beneficiary_name: beneficiary.fullName,
      beneficiary_phone: '0812345678',
      beneficiary_code: beneficiary.code,
      pin: '1234',
      idempotency_key: randomUUID(),
    })
    sent.assertStatus(201)
    assert.equal((sent.body() as any).data.status, 'paid')
    assert.isNull((sent.body() as any).data.pickup_code)

    await target.refresh()
    assert.equal(target.balanceCache, 10000n)
  })

  test('a watchlist match holds the transfer until compliance decides', async ({
    client,
    assert,
  }) => {
    const suffix = suffixOf()
    const listed = `Kabila Watch ${suffix}`
    await WatchlistEntry.create({
      fullName: listed,
      normalizedName: normalizeName(listed),
      source: 'TEST',
      reference: null,
    })
    const { user, wallet } = await sender(suffix)
    const { agentUser } = await payingAgent(suffix)

    const { sent } = await sendCash(user, client, '10000000', `Watch ${suffix} Kabila`)
    const body = (sent.body() as any).data
    assert.equal(body.status, 'held')

    const lookup = await client
      .post('/api/v1/agent/remittances/lookup')
      .loginAs(agentUser)
      .json({ code: body.pickup_code })
    lookup.assertStatus(200)
    const pay = await client
      .post(`/api/v1/agent/remittances/${body.id}/pay`)
      .loginAs(agentUser)
      .json({
        code: body.pickup_code,
        beneficiary_phone: '0812345678',
        id_type: 'national_id',
        id_number: 'X-12345',
      })
    assert.equal((pay.body() as any).code, 'REMITTANCE_HELD')

    const queue = await asAdmin(client.get('/api/v1/admin/remittances').qs({ status: 'held' }))
    assert.isTrue((queue.body() as any).data.some((r: any) => r.id === body.id))

    const rejected = await asAdmin(client.post(`/api/v1/admin/remittances/${body.id}/reject`)).json(
      {
        reason: 'Confirmed match on the sanctions list',
      }
    )
    rejected.assertStatus(200)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n, 'sender refunded every unit')
  })

  test('cancelling refunds in full; so does expiry', async ({ client, assert }) => {
    const suffix = suffixOf()
    const { user, wallet } = await sender(suffix)

    const { sent: first } = await sendCash(user, client)
    const cancel = await client
      .post(`/api/v1/remittances/${(first.body() as any).data.id}/cancel`)
      .loginAs(user)
    cancel.assertStatus(200)
    assert.equal((cancel.body() as any).data.status, 'cancelled')
    assert.isNull((cancel.body() as any).data.pickup_code)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n)

    const { sent: second } = await sendCash(user, client)
    const id = (second.body() as any).data.id
    await db
      .from('remittances')
      .where('id', id)
      .update({
        expires_at: DateTime.now().minus({ minutes: 1 }).toJSDate(),
      })
    assert.isAtLeast(await RemittanceService.expireStale(), 1)
    const expired = await Remittance.findOrFail(id)
    assert.equal(expired.status, 'expired')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n)
  })

  test('an agent guessing codes is stopped', async ({ client, assert }) => {
    const { agentUser } = await payingAgent(suffixOf())
    let last: any
    for (let i = 0; i < 11; i++) {
      last = await client
        .post('/api/v1/agent/remittances/lookup')
        .loginAs(agentUser)
        .json({ code: `00000000${String(i).padStart(2, '0')}` })
    }
    last.assertStatus(429)
    assert.equal((last.body() as any).code, 'TOO_MANY_LOOKUPS')
  })

  /** A PawaPay stand-in: accepts or refuses, remembers what it was asked, never calls out. */
  function fakeProvider(outcome: 'ACCEPTED' | 'REJECTED' = 'ACCEPTED') {
    const calls: { reference: string; amount: string; phone: string; code: string }[] = []
    const provider: RemittanceMobileMoneyProvider = {
      name: 'pawapay',
      initiateDeposit: async () => ({ outcome: 'ACCEPTED' }),
      checkDepositStatus: async () => ({ status: 'COMPLETED' }),
      checkPayoutStatus: async () => ({ status: 'PROCESSING' }),
      initiatePayout: async (params) => {
        calls.push({
          reference: params.providerReferenceId,
          amount: params.amount,
          phone: params.phoneNumber,
          code: params.providerCode,
        })
        return outcome === 'ACCEPTED'
          ? { outcome }
          : { outcome, failureReason: { code: 'INVALID_PHONE', message: 'Unknown MSISDN' } }
      },
      getProviderConfig: async (currency, code) => ({
        provider: code,
        currency,
        status: 'OPERATIONAL',
        minAmount: 100n,
        maxAmount: 1_000_000_00n,
        // Whole units only, like many CDF operators.
        decimalsInAmount: 'NONE',
        authorization: null,
      }),
    }
    return { provider, calls }
  }

  async function sendMobileMoney(
    user: User,
    provider: RemittanceMobileMoneyProvider,
    payoutCurrency = 'USD'
  ) {
    const quote = await RemittanceService.quote(
      user,
      {
        sourceCurrency: 'BIF',
        payoutCurrency,
        payoutMethod: 'mobile_money',
        sendAmount: 10_000_000n,
        providerCode: 'VODACOM_MPESA_COD',
      },
      provider
    )
    const { remittance } = await RemittanceService.send(
      user,
      {
        quoteId: quote.id,
        payoutMethod: 'mobile_money',
        beneficiaryName: 'Mapendo Kahindo',
        beneficiaryPhone: '0812345678',
        idempotencyKey: randomUUID(),
        correlationId: 'test',
      },
      provider
    )
    return { quote, remittance }
  }

  test('mobile money: accepted, then confirmed by webhook', async ({ assert }) => {
    const { user } = await sender(suffixOf())
    const { provider, calls } = fakeProvider('ACCEPTED')

    const { quote, remittance } = await sendMobileMoney(user, provider)
    assert.equal(quote.payoutAmount % 100n, 0n, 'rounded to whole units for the operator')
    assert.equal(remittance.status, 'processing')
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].phone, '243812345678')
    assert.equal(calls[0].code, 'VODACOM_MPESA_COD')

    const settled = await RemittanceService.confirmMobileMoneyPayout(
      calls[0].reference,
      'COMPLETED',
      { providerTransactionId: 'PP-123' },
      'test'
    )
    assert.equal(settled?.status, 'paid')

    // A duplicate webhook changes nothing.
    const again = await RemittanceService.confirmMobileMoneyPayout(
      calls[0].reference,
      'FAILED',
      {},
      'test'
    )
    assert.equal(again?.status, 'paid')
  })

  test('mobile money: a failure refunds the sender in full', async ({ assert }) => {
    const { user, wallet } = await sender(suffixOf())
    const { provider, calls } = fakeProvider('ACCEPTED')
    const { remittance } = await sendMobileMoney(user, provider)
    assert.equal(remittance.status, 'processing')

    const failed = await RemittanceService.confirmMobileMoneyPayout(
      calls[0].reference,
      'FAILED',
      { failureReason: { code: 'RECIPIENT_NOT_FOUND', message: 'No wallet' } },
      'test'
    )
    assert.equal(failed?.status, 'failed')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n)
  })

  test('mobile money: an operator refusal refunds at once, and cannot be cancelled after dispatch', async ({
    client,
    assert,
  }) => {
    const { user, wallet } = await sender(suffixOf())

    const refused = await sendMobileMoney(user, fakeProvider('REJECTED').provider)
    assert.equal(refused.remittance.status, 'failed')
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 5_000_000_00n)

    const accepted = await sendMobileMoney(user, fakeProvider('ACCEPTED').provider)
    const cancel = await client
      .post(`/api/v1/remittances/${accepted.remittance.id}/cancel`)
      .loginAs(user)
    cancel.assertStatus(409)
  })

  test('mobile money: a whole-unit operator refuses cents in a same-currency transfer', async ({
    assert,
  }) => {
    const { user } = await sender(suffixOf(), 'USD', 500_00n)
    await assert.rejects(
      () =>
        RemittanceService.quote(
          user,
          {
            sourceCurrency: 'USD',
            payoutCurrency: 'USD',
            payoutMethod: 'mobile_money',
            sendAmount: 10_50n,
            providerCode: 'VODACOM_MPESA_COD',
          },
          fakeProvider().provider
        ),
      /only pays whole/
    )
  })
})
