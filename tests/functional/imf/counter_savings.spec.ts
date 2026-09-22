import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { CounterEnrolmentService } from '#services/counter/counter_enrolment_service'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { PinService } from '#services/security/pin_service'

const json = (res: { body(): unknown }) => res.body() as any

/**
 * Savings opened and worked across the counter, for someone with no smartphone.
 *
 * Two properties matter here beyond the money itself. Savings move between two wallets the
 * customer already owns, so no notes cross the counter and nothing may book to a teller session —
 * booking them would move a shift's expected cash while the drawer stood still, manufacturing a
 * variance out of nothing. And a teller acts only for the institution employing them: a
 * competitor's book must be unreachable, products included.
 */
test.group('Counter savings', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `cs-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function institution(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTCS${suffix}`,
      name: `Institution ${suffix}`,
      email: `cs${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `cs-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    const counter = await AgentOnboardingService.create({
      businessId: business.id,
      code: `2${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `ctr-${randomUUID()}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `cs-${suffix}`,
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'agent'
    kyc.subjectId = counter.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    kyc.reviewedBy = adminId
    await kyc.save()
    await AgentLifecycleService.approve(counter.id, adminId, `cs-${suffix}`)
    await counter.refresh()
    await db.from('wallets').where('id', counter.walletId!).update({ balance_cache: 10_000_00n })

    const tellerUser = await User.create({
      fullName: `Teller ${suffix}`,
      email: `tl-${randomUUID()}@example.test`,
      password: 'a-real-password',
    })
    await PinService.setPin(tellerUser, '1111')
    const teller = await BusinessStaff.create({
      businessId: business.id,
      userId: tellerUser.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })

    const product = await FinancialProductService.create(
      business.id,
      {
        code: `CS${suffix}`,
        name: 'Epargne a vue',
        kind: 'savings',
        currencyCode: 'USD',
        interestRateBps: 300,
        interestPeriod: 'year',
      },
      `cs-${suffix}`
    )
    await FinancialProductService.submit(product, `cs-${suffix}`)
    await FinancialProductService.approve(product, adminId, `cs-${suffix}`)

    return { business, counter, teller, tellerUser, product }
  }

  async function walkIn(suffix: string, teller: BusinessStaff, counterId: number, funds = 0n) {
    const { user, wallet } = await CounterEnrolmentService.enrol(
      teller,
      counterId,
      {
        fullName: `Customer ${suffix}`,
        pin: '2222',
        currencyCode: 'USD',
        documents: [
          { type: 'id_card_front', buffer: Buffer.from('f'), mimeType: 'image/jpeg' },
          { type: 'id_card_back', buffer: Buffer.from('b'), mimeType: 'image/jpeg' },
        ],
        verificationType: 'identity',
      },
      `cs-${suffix}`
    )
    if (funds > 0n) {
      await db.from('wallets').where('id', wallet.id).update({ balance_cache: funds })
      await wallet.refresh()
    }
    return { user, wallet }
  }

  test('a teller opens savings for someone with no smartphone', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, counter, product } = await institution(suffix)
    const { user: customer, wallet } = await walkIn(suffix, teller, counter.id, 400_00n)

    assert.isNull(customer.email, 'no app, no address')

    const res = await client.post('/api/v1/counter/savings').loginAs(tellerUser).json({
      customer_code: customer.code!,
      product_id: product.id,
      initial_amount: '15000',
      customer_pin: '2222',
    })

    assert.equal(res.status(), 201)
    assert.equal(json(res).data.balance, '15000')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 250_00n)
  })

  test("a teller's PIN cannot move a customer's savings", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, counter, product } = await institution(suffix)
    const { user: customer, wallet } = await walkIn(suffix, teller, counter.id, 400_00n)

    // Locking someone's balance away without their agreement is as much a wrong as releasing it.
    const res = await client.post('/api/v1/counter/savings').loginAs(tellerUser).json({
      customer_code: customer.code!,
      product_id: product.id,
      initial_amount: '15000',
      customer_pin: '1111',
    })

    assert.equal(res.status(), 401)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 400_00n, 'nothing moved')
  })

  test('savings movements leave the drawer count untouched', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, counter, product } = await institution(suffix)
    const { user: customer } = await walkIn(suffix, teller, counter.id, 400_00n)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 500_00n }],
      `cs-${suffix}`
    )

    await client.post('/api/v1/counter/savings').loginAs(tellerUser).json({
      customer_code: customer.code!,
      product_id: product.id,
      initial_amount: '30000',
      customer_pin: '2222',
    })

    // Not one banknote crossed the counter, so the shift must still expect exactly what it opened
    // with. Booking these would invent a variance nobody could explain.
    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 500_00n }],
      { correlationId: `cs-${suffix}` }
    )
    assert.equal(closed.balances[0].expectedCash, 500_00n)
    assert.equal(closed.balances[0].variance, 0n)

    const booked = await db
      .from('ledger_transactions')
      .where('teller_session_id', session.id)
      .count('* as total')
    assert.equal(Number(booked[0].total), 0)
  })

  test('cash then savings keeps the drawer honest', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, counter, product } = await institution(suffix)
    const { user: customer } = await walkIn(suffix, teller, counter.id)

    const session = await TellerSessionService.open(
      teller,
      [{ currencyCode: 'USD', amount: 0n }],
      `cs-${suffix}`
    )

    // Someone arrives with notes and wants them saved: a cash-in, then a savings deposit.
    const cashIn = await client.post('/api/v1/counter/cash-in').loginAs(tellerUser).json({
      customer_code: customer.code!,
      amount: '20000',
      currency_code: 'USD',
      teller_pin: '1111',
      idempotency_key: randomUUID(),
    })
    assert.equal(cashIn.status(), 201)
    await client
      .post(`/api/v1/counter/cash-in/${json(cashIn).data.transaction_id}/confirm`)
      .loginAs(tellerUser)
      .json({ teller_pin: '1111' })

    const customerWallet = await db
      .from('wallets')
      .where('user_id', customer.id)
      .where('purpose', 'primary')
      .first()

    const saved = await client
      .post('/api/v1/counter/savings')
      .loginAs(tellerUser)
      .json({
        customer_code: customer.code!,
        product_id: product.id,
        initial_amount: String(BigInt(customerWallet.balance_cache)),
        customer_pin: '2222',
      })
    assert.equal(saved.status(), 201)

    // The notes are in the drawer; where the customer then parked them changes nothing.
    const closed = await TellerSessionService.close(
      session,
      [{ currencyCode: 'USD', amount: 200_00n }],
      { correlationId: `cs-${suffix}` }
    )
    assert.equal(closed.balances[0].expectedCash, 200_00n)
    assert.equal(closed.balances[0].variance, 0n)
  })

  test("a teller cannot touch a competitor's book", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await institution(suffix)
    const second = await institution(`${Number(suffix) + 1}`.slice(-8))
    const { user: customer } = await walkIn(suffix, first.teller, first.counter.id, 400_00n)

    // The other institution's product is not sellable here.
    const foreignProduct = await client
      .post('/api/v1/counter/savings')
      .loginAs(first.tellerUser)
      .json({
        customer_code: customer.code!,
        product_id: second.product.id,
        initial_amount: '10000',
        customer_pin: '2222',
      })
    assert.equal(foreignProduct.status(), 404)

    // And an account held with one is invisible to the other.
    const opened = await client.post('/api/v1/counter/savings').loginAs(first.tellerUser).json({
      customer_code: customer.code!,
      product_id: first.product.id,
      initial_amount: '10000',
      customer_pin: '2222',
    })
    const accountId = json(opened).data.id

    const raid = await client
      .post(`/api/v1/counter/savings/${accountId}/withdraw`)
      .loginAs(second.tellerUser)
      .json({ amount: '10000', customer_pin: '2222' })
    assert.equal(raid.status(), 404)

    const listed = await client
      .get('/api/v1/counter/savings')
      .qs({ customer_code: customer.code! })
      .loginAs(second.tellerUser)
    assert.equal(listed.status(), 200)
    assert.lengthOf(json(listed).data, 0, 'the competitor sees an empty book')
  })

  test('a teller pays savings back out over the counter', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, tellerUser, counter, product } = await institution(suffix)
    const { user: customer, wallet } = await walkIn(suffix, teller, counter.id, 400_00n)

    const opened = await client.post('/api/v1/counter/savings').loginAs(tellerUser).json({
      customer_code: customer.code!,
      product_id: product.id,
      initial_amount: '40000',
      customer_pin: '2222',
    })
    const accountId = json(opened).data.id

    const withdrawn = await client
      .post(`/api/v1/counter/savings/${accountId}/withdraw`)
      .loginAs(tellerUser)
      .json({ amount: '15000', customer_pin: '2222' })

    assert.equal(withdrawn.status(), 200)
    assert.equal(json(withdrawn).data.balance, '25000')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 150_00n, 'back in what they can spend or draw as cash')
  })
})
