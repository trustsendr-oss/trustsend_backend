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
import { PinService } from '#services/security/pin_service'

// The typed client cannot see through the controllers' union responses; tests read raw JSON.
const json = (res: { body(): unknown }) => res.body() as any

/**
 * The counter routes over real HTTP.
 *
 * The service-level specs already cover the money. What only a request can exercise is the chain
 * in front of it: middleware.auth() resolving a person, middleware.businessStaff() turning them
 * into an institution, and the rules the controllers add on top — who may close a shift, who may
 * sign one off, and which PIN a withdrawal demands. Those are the rules that stand between a
 * teller and someone else's balance, so they are checked here as a caller would hit them.
 *
 * Nothing is torn down: see counter_cash.spec.ts for why an append-only ledger forbids it.
 */
test.group('Counter routes over HTTP', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `http-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function institution(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTHTTP${suffix}`,
      name: `Institution ${suffix}`,
      email: `http${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `http-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    const counter = await AgentOnboardingService.create({
      businessId: business.id,
      code: `2${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `ctr${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `http-${suffix}`,
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
    await AgentLifecycleService.approve(counter.id, adminId, `http-${suffix}`)
    await counter.refresh()
    await db.from('wallets').where('id', counter.walletId!).update({ balance_cache: 10_000_00n })

    const staffMember = async (label: string, role: 'teller' | 'branch_manager', pin: string) => {
      const person = await User.create({
        fullName: `${label} ${suffix}`,
        email: `${label}-${randomUUID()}@example.test`,
        password: 'a-real-password',
      })
      await PinService.setPin(person, pin)
      const posting = await BusinessStaff.create({
        businessId: business.id,
        userId: person.id,
        agentId: role === 'teller' ? counter.id : null,
        role,
        status: 'active',
      })
      return { person, posting }
    }

    return {
      business,
      counter,
      teller: await staffMember('teller', 'teller', '1111'),
      manager: await staffMember('manager', 'branch_manager', '3333'),
    }
  }

  async function walkInCustomer(suffix: string, teller: BusinessStaff, counterId: number) {
    return CounterEnrolmentService.enrol(
      teller,
      counterId,
      {
        fullName: `Customer ${suffix}`,
        pin: '2222',
        currencyCode: 'USD',
        documents: [
          { type: 'id_card_front', buffer: Buffer.from('front'), mimeType: 'image/jpeg' },
          { type: 'id_card_back', buffer: Buffer.from('back'), mimeType: 'image/jpeg' },
        ],
        verificationType: 'identity',
      },
      `http-${suffix}`
    )
  }

  test('an ordinary user reaches no counter at all', async ({ client, assert }) => {
    const outsider = await User.create({
      fullName: 'Outsider',
      email: `outsider-${randomUUID()}@example.test`,
      password: 'a-real-password',
    })

    const res = await client.get('/api/v1/counter/sessions').loginAs(outsider)

    assert.equal(res.status(), 403)
    assert.equal(json(res).code, 'E_NOT_INSTITUTION_STAFF')
  })

  test('a teller opens and reads back their own drawer', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller } = await institution(suffix)

    const opened = await client
      .post('/api/v1/counter/sessions')
      .loginAs(teller.person)
      .json({ opening_cash: [{ currency_code: 'USD', amount: '50000' }] })

    assert.equal(opened.status(), 201)
    assert.equal(json(opened).data.status, 'open')
    assert.equal(json(opened).data.balances[0].opening_cash, '50000')

    const current = await client.get('/api/v1/counter/sessions/current').loginAs(teller.person)
    assert.equal(current.status(), 200)
    assert.equal(json(current).data.id, json(opened).data.id)
  })

  test('a deposit over the counter credits the customer', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await institution(suffix)
    const { user: customer, wallet } = await walkInCustomer(suffix, teller.posting, counter.id)

    await client
      .post('/api/v1/counter/sessions')
      .loginAs(teller.person)
      .json({ opening_cash: [{ currency_code: 'USD', amount: '0' }] })

    const res = await client.post('/api/v1/counter/cash-in').loginAs(teller.person).json({
      customer_code: customer.code!,
      amount: '12000',
      currency_code: 'USD',
      teller_pin: '1111',
      idempotency_key: randomUUID(),
    })

    assert.equal(res.status(), 201)
    assert.isNotNull(json(res).data.teller_session_id, 'booked to the open shift')

    const confirmed = await client
      .post(`/api/v1/counter/cash-in/${json(res).data.transaction_id}/confirm`)
      .loginAs(teller.person)
      .json({ teller_pin: '1111' })

    assert.equal(confirmed.status(), 200)
    await wallet.refresh()
    assert.isAbove(Number(wallet.balanceCache), 0)
  })

  test("a teller's PIN cannot authorise a withdrawal", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await institution(suffix)
    const { user: customer, wallet } = await walkInCustomer(suffix, teller.posting, counter.id)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 50_000n })

    await client
      .post('/api/v1/counter/sessions')
      .loginAs(teller.person)
      .json({ opening_cash: [{ currency_code: 'USD', amount: '100000' }] })

    // The teller's own PIN, offered as the customer's. This is the attack the asymmetry exists
    // for: if it succeeded, any teller could empty any account whose code they can read.
    const stolen = await client.post('/api/v1/counter/cash-out').loginAs(teller.person).json({
      customer_code: customer.code!,
      amount: '10000',
      currency_code: 'USD',
      customer_pin: '1111',
      idempotency_key: randomUUID(),
    })

    assert.equal(stolen.status(), 401)
    await wallet.refresh()
    assert.equal(Number(wallet.balanceCache), 50_000, 'nothing moved')

    // With the holder's own PIN it goes through.
    const legitimate = await client.post('/api/v1/counter/cash-out').loginAs(teller.person).json({
      customer_code: customer.code!,
      amount: '10000',
      currency_code: 'USD',
      customer_pin: '2222',
      idempotency_key: randomUUID(),
    })

    assert.equal(legitimate.status(), 201)
  })

  test('cash is refused when no drawer is open', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await institution(suffix)
    const { user: customer } = await walkInCustomer(suffix, teller.posting, counter.id)

    const res = await client.post('/api/v1/counter/cash-in').loginAs(teller.person).json({
      customer_code: customer.code!,
      amount: '1000',
      currency_code: 'USD',
      teller_pin: '1111',
      idempotency_key: randomUUID(),
    })

    assert.equal(res.status(), 409)
    assert.equal(json(res).code, 'E_NO_OPEN_SESSION')
  })

  test('a teller cannot sign off a shift, a manager can', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, manager } = await institution(suffix)

    const opened = await client
      .post('/api/v1/counter/sessions')
      .loginAs(teller.person)
      .json({ opening_cash: [{ currency_code: 'USD', amount: '0' }] })
    const sessionId = json(opened).data.id

    await client
      .post(`/api/v1/counter/sessions/${sessionId}/close`)
      .loginAs(teller.person)
      .json({ counted_cash: [{ currency_code: 'USD', amount: '0' }] })

    const bySelf = await client
      .post(`/api/v1/counter/sessions/${sessionId}/reconcile`)
      .loginAs(teller.person)
      .json({})
    assert.equal(bySelf.status(), 403)
    assert.equal(json(bySelf).code, 'E_NOT_A_SUPERVISOR')

    const byManager = await client
      .post(`/api/v1/counter/sessions/${sessionId}/reconcile`)
      .loginAs(manager.person)
      .json({ notes: 'Caisse conforme' })
    assert.equal(byManager.status(), 200)
    assert.equal(json(byManager).data.status, 'reconciled')
  })

  test('one institution never sees another shifts', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await institution(suffix)
    const second = await institution(`${Number(suffix) + 1}`.slice(-8))

    const opened = await client
      .post('/api/v1/counter/sessions')
      .loginAs(first.teller.person)
      .json({ opening_cash: [{ currency_code: 'USD', amount: '0' }] })
    const sessionId = json(opened).data.id

    const listed = await client.get('/api/v1/counter/sessions').loginAs(second.teller.person)
    assert.equal(listed.status(), 200)
    assert.notInclude(
      json(listed).data.map((s: { id: number }) => s.id),
      sessionId,
      'a competitor institution shift must not surface'
    )

    // And addressing it directly is a 404, not a 403: its existence is not this caller's business.
    const closed = await client
      .post(`/api/v1/counter/sessions/${sessionId}/close`)
      .loginAs(second.teller.person)
      .json({ counted_cash: [{ currency_code: 'USD', amount: '0' }] })
    assert.equal(closed.status(), 404)
  })

  test('a customer lookup confirms identity without disclosing a balance', async ({
    client,
    assert,
  }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { teller, counter } = await institution(suffix)
    const { user: customer, wallet } = await walkInCustomer(suffix, teller.posting, counter.id)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 777_00n })

    const res = await client
      .get('/api/v1/counter/customers')
      .qs({ code: customer.code! })
      .loginAs(teller.person)

    assert.equal(res.status(), 200)
    const body = json(res).data
    assert.equal(body.code, customer.code)
    assert.deepEqual(body.currencies, ['USD'])
    assert.notProperty(body, 'balance')
    assert.notProperty(body, 'phone')
  })
})
