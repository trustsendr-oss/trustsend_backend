import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import type Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import User from '#models/user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'

// The typed client cannot see through the controllers' union responses; tests read raw JSON.
const json = (res: { body(): unknown }) => res.body() as any

/**
 * An institution running its own network from its dashboard account: counters, the people posted
 * to them, and a staff member finding out who they are once signed in.
 *
 * Nothing is torn down: see counter_cash.spec.ts for why an append-only ledger forbids it.
 */
test.group('Institution management over HTTP', () => {
  async function institution(suffix: string): Promise<Business> {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTMGMT${suffix}`,
      name: `Institution ${suffix}`,
      email: `mgmt${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `mgmt-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()
    return business
  }

  const suffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10)

  test('the first counter becomes the head office, the next ones hang off it', async ({
    client,
    assert,
  }) => {
    const business = await institution(suffix())
    const as = (req: any) => req.withGuard('businessDashboard').loginAs(business)

    const head = await as(client.post('/api/v1/business/dashboard/outlets')).json({
      name: 'Siège',
      phone: '+243900000010',
      city: 'Goma',
    })
    assert.equal(head.status(), 201)
    assert.equal(json(head).data.status, 'active')
    assert.isTrue(json(head).data.is_head_office)
    assert.equal(json(head).data.tier, 'distributor')

    const branch = await as(client.post('/api/v1/business/dashboard/outlets')).json({
      name: 'Guichet Birere',
      phone: '+243900000011',
    })
    assert.equal(branch.status(), 201)
    assert.isFalse(json(branch).data.is_head_office)
    assert.equal(json(branch).data.parent_agent_id, json(head).data.id)

    const list = await as(client.get('/api/v1/business/dashboard/outlets'))
    assert.equal(list.status(), 200)
    assert.lengthOf(json(list).data, 2)
  })

  test('a counter is suspended with a reason and reactivated', async ({ client, assert }) => {
    const business = await institution(suffix())
    const as = (req: any) => req.withGuard('businessDashboard').loginAs(business)
    const opened = await as(client.post('/api/v1/business/dashboard/outlets')).json({
      name: 'Siège',
      phone: '+243900000010',
    })
    const id = json(opened).data.id

    const noReason = await as(client.post(`/api/v1/business/dashboard/outlets/${id}/suspend`)).json(
      {}
    )
    assert.equal(noReason.status(), 422)

    const suspended = await as(
      client.post(`/api/v1/business/dashboard/outlets/${id}/suspend`)
    ).json({ reason: 'Travaux dans le local' })
    assert.equal(json(suspended).data.status, 'suspended')

    const again = await as(client.post(`/api/v1/business/dashboard/outlets/${id}/suspend`)).json({
      reason: 'Travaux dans le local',
    })
    assert.equal(again.status(), 409)
    assert.equal(json(again).code, 'E_COUNTER_STATE')

    const back = await as(client.post(`/api/v1/business/dashboard/outlets/${id}/reactivate`))
    assert.equal(json(back).data.status, 'active')
  })

  test("another institution's counter does not exist", async ({ client, assert }) => {
    const mine = await institution(suffix())
    const theirs = await institution(suffix())
    const theirCounter = await client
      .post('/api/v1/business/dashboard/outlets')
      .withGuard('businessDashboard')
      .loginAs(theirs)
      .json({ name: 'Leur siège', phone: '+243900000010' })

    const res = await client
      .get(`/api/v1/business/dashboard/outlets/${json(theirCounter).data.id}`)
      .withGuard('businessDashboard')
      .loginAs(mine)
    assert.equal(res.status(), 404)
  })

  test('staff: a new account is created once, a teller needs a counter', async ({
    client,
    assert,
  }) => {
    const business = await institution(suffix())
    const as = (req: any) => req.withGuard('businessDashboard').loginAs(business)
    const counter = json(
      await as(client.post('/api/v1/business/dashboard/outlets')).json({
        name: 'Siège',
        phone: '+243900000010',
      })
    ).data

    const unposted = await as(client.post('/api/v1/business/dashboard/staff')).json({
      role: 'teller',
      full_name: 'Guichetière Sans Guichet',
      email: `teller-${randomUUID()}@example.test`,
    })
    assert.equal(unposted.status(), 400)
    assert.equal(json(unposted).code, 'E_TELLER_NEEDS_COUNTER')

    const email = `teller-${randomUUID()}@example.test`
    const created = await as(client.post('/api/v1/business/dashboard/staff')).json({
      role: 'teller',
      agent_id: counter.id,
      full_name: 'Aline Guichet',
      email,
    })
    assert.equal(created.status(), 201)
    assert.isString(json(created).data.generated_password)
    assert.equal(json(created).data.agent.id, counter.id)

    // The generated password is a real credential for an ordinary TumaPlus login.
    const login = await client
      .post('/api/v1/auth/login')
      .json({ email, password: json(created).data.generated_password })
    assert.equal(login.status(), 200)

    // And once signed in, the person learns who they are at the institution.
    const person = await User.findByOrFail('email', email)
    const me = await client.get('/api/v1/business/staff/me').loginAs(person)
    assert.equal(me.status(), 200)
    assert.equal(json(me).data.role, 'teller')
    assert.equal(json(me).data.agent.id, counter.id)
    assert.equal(json(me).data.business.id, business.id)

    const twice = await as(client.post('/api/v1/business/dashboard/staff')).json({
      role: 'credit_officer',
      email,
    })
    assert.equal(twice.status(), 409)
    assert.equal(json(twice).code, 'E_ALREADY_STAFF')
  })

  test('one institution per person', async ({ client, assert }) => {
    const first = await institution(suffix())
    const second = await institution(suffix())
    const person = await User.create({
      fullName: 'Agent de crédit',
      email: `officer-${randomUUID()}@example.test`,
      password: 'a-real-password',
      code: suffix().padStart(9, '7').slice(-9),
    })

    const hired = await client
      .post('/api/v1/business/dashboard/staff')
      .withGuard('businessDashboard')
      .loginAs(first)
      .json({ role: 'credit_officer', user_code: person.code })
    assert.equal(hired.status(), 201)
    assert.isNull(json(hired).data.generated_password)

    const poached = await client
      .post('/api/v1/business/dashboard/staff')
      .withGuard('businessDashboard')
      .loginAs(second)
      .json({ role: 'credit_officer', user_code: person.code })
    assert.equal(poached.status(), 409)
    assert.equal(json(poached).code, 'E_STAFF_ELSEWHERE')
  })

  test('a suspended staff member is refused at the counter', async ({ client, assert }) => {
    const business = await institution(suffix())
    const email = `officer-${randomUUID()}@example.test`
    const created = await client
      .post('/api/v1/business/dashboard/staff')
      .withGuard('businessDashboard')
      .loginAs(business)
      .json({ role: 'credit_officer', full_name: 'Agent Suspendu', email })
    const staffId = json(created).data.id

    await client
      .patch(`/api/v1/business/dashboard/staff/${staffId}`)
      .withGuard('businessDashboard')
      .loginAs(business)
      .json({ status: 'suspended' })

    const member = await BusinessStaff.findOrFail(staffId)
    assert.equal(member.status, 'suspended')

    const person = await User.findByOrFail('email', email)
    const me = await client.get('/api/v1/business/staff/me').loginAs(person)
    assert.equal(me.status(), 403)
    assert.equal(json(me).code, 'E_NOT_INSTITUTION_STAFF')
  })

  test('management reads its book', async ({ client, assert }) => {
    const business = await institution(suffix())
    for (const path of ['loans', 'savings', 'customers', 'teller-sessions', 'staff']) {
      const res = await client
        .get(`/api/v1/business/dashboard/${path}`)
        .withGuard('businessDashboard')
        .loginAs(business)
      assert.equal(res.status(), 200, path)
      assert.isArray(json(res).data, path)
    }
  })
})
