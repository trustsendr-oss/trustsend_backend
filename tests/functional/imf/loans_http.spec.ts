import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import User from '#models/user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

const json = (res: { body(): unknown }) => res.body() as any

/**
 * Credit over real HTTP, from application to settlement.
 *
 * What only a request exercises is the authority around the money: a borrower reaching another
 * borrower's file, a teller deciding on credit they have no business deciding, and one
 * institution's officer touching a competitor's book. Each of those is a rule the service alone
 * does not enforce.
 */
test.group('Loans over HTTP', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `lnh-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function institution(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTLNH${suffix}`,
      name: `Institution ${suffix}`,
      email: `lnh${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `lnh-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()
    await db.from('wallets').where('business_id', business.id).update({ balance_cache: '10000000' })

    const product = await FinancialProductService.create(
      business.id,
      {
        code: `LNH${suffix}`,
        name: 'Credit commercant',
        kind: 'loan',
        currencyCode: 'USD',
        interestRateBps: 500,
        interestPeriod: 'month',
        interestMethod: 'flat',
        termMonthsMax: 6,
      },
      `lnh-${suffix}`
    )
    await FinancialProductService.submit(product, `lnh-${suffix}`)
    await FinancialProductService.approve(product, adminId, `lnh-${suffix}`)

    const staffOf = async (role: 'credit_officer' | 'teller') => {
      const person = await User.create({
        fullName: `${role} ${suffix}`,
        email: `${role}-${randomUUID()}@example.test`,
        password: 'a-real-password',
      })
      await BusinessStaff.create({
        businessId: business.id,
        userId: person.id,
        agentId: null,
        role,
        status: 'active',
      })
      return person
    }

    return {
      business,
      product,
      officer: await staffOf('credit_officer'),
      teller: await staffOf('teller'),
    }
  }

  test('a borrower applies, an officer approves, the money lands', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await institution(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `lnh-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: product.id, amount: '100000', pin: TEST_PIN })
    assert.equal(applied.status(), 201)
    assert.equal(json(applied).data.status, 'requested')
    const loanId = json(applied).data.id

    const approved = await client
      .post(`/api/v1/counter/loans/${loanId}/approve`)
      .loginAs(officer)
      .json({})
    assert.equal(approved.status(), 200)
    assert.equal(json(approved).data.status, 'approved')

    const disbursed = await client
      .post(`/api/v1/counter/loans/${loanId}/disburse`)
      .loginAs(officer)
      .json({})
    assert.equal(disbursed.status(), 200)
    assert.equal(json(disbursed).data.status, 'disbursed')
    assert.lengthOf(json(disbursed).data.schedule, 6)
    assert.equal(json(disbursed).data.interest_outstanding, '30000')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 1_000_00n)
  })

  test('a teller cannot decide on credit', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, teller } = await institution(suffix)
    const { user } = await createUserWithWallet({ email: `lnh-${randomUUID()}@test.com` })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: product.id, amount: '100000', pin: TEST_PIN })

    const res = await client
      .post(`/api/v1/counter/loans/${json(applied).data.id}/approve`)
      .loginAs(teller)
      .json({})

    assert.equal(res.status(), 403)
    assert.equal(json(res).code, 'E_NOT_A_CREDIT_OFFICER')
  })

  test("an officer cannot reach a competitor's book", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await institution(suffix)
    const second = await institution(`${Number(suffix) + 1}`.slice(-8))
    const { user } = await createUserWithWallet({ email: `lnh-${randomUUID()}@test.com` })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: first.product.id, amount: '100000', pin: TEST_PIN })
    const loanId = json(applied).data.id

    const raid = await client
      .post(`/api/v1/counter/loans/${loanId}/approve`)
      .loginAs(second.officer)
      .json({})
    assert.equal(raid.status(), 404, 'another institution file does not exist here')

    const listed = await client.get('/api/v1/counter/loans').loginAs(second.officer)
    assert.notInclude(
      json(listed).data.map((l: { id: number }) => l.id),
      loanId
    )
  })

  test("a borrower cannot pay down someone else's loan", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await institution(suffix)
    const owner = await createUserWithWallet({ email: `lnh-${randomUUID()}@test.com` })
    const stranger = await createUserWithWallet({
      email: `lnh-${randomUUID()}@test.com`,
      balance: 500_00n,
    })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(owner.user)
      .json({ product_id: product.id, amount: '100000', pin: TEST_PIN })
    const loanId = json(applied).data.id
    await client.post(`/api/v1/counter/loans/${loanId}/approve`).loginAs(officer).json({})
    await client.post(`/api/v1/counter/loans/${loanId}/disburse`).loginAs(officer).json({})

    const res = await client
      .post(`/api/v1/finance/loans/${loanId}/repay`)
      .loginAs(stranger.user)
      .json({ amount: '10000', pin: TEST_PIN })

    assert.equal(res.status(), 404)
    await stranger.wallet.refresh()
    assert.equal(stranger.wallet.balanceCache, 500_00n, 'not a cent left the stranger')
  })

  test('a borrower repays and watches the schedule settle', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await institution(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `lnh-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: product.id, amount: '100000', pin: TEST_PIN })
    const loanId = json(applied).data.id
    await client.post(`/api/v1/counter/loans/${loanId}/approve`).loginAs(officer).json({})
    await client.post(`/api/v1/counter/loans/${loanId}/disburse`).loginAs(officer).json({})

    // They received 1000.00; top them up so they can cover the interest too.
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: '200000' })

    const repaid = await client
      .post(`/api/v1/finance/loans/${loanId}/repay`)
      .loginAs(user)
      .json({ amount: '21667', pin: TEST_PIN })

    assert.equal(repaid.status(), 200)
    assert.equal(json(repaid).data.status, 'repaying')
    const first = json(repaid).data.schedule[0]
    assert.equal(first.remaining, '0', 'the first instalment is settled')
    assert.isNotNull(first.settled_at)
  })

  test('a refusal reaches the borrower with its reason', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await institution(suffix)
    const { user } = await createUserWithWallet({ email: `lnh-${randomUUID()}@test.com` })

    const applied = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: product.id, amount: '100000', pin: TEST_PIN })
    const loanId = json(applied).data.id

    await client
      .post(`/api/v1/counter/loans/${loanId}/reject`)
      .loginAs(officer)
      .json({ notes: 'Revenus insuffisants pour cette echeance.' })

    const seen = await client.get(`/api/v1/finance/loans/${loanId}`).loginAs(user)
    assert.equal(json(seen).data.status, 'rejected')
    assert.equal(json(seen).data.decision_notes, 'Revenus insuffisants pour cette echeance.')
  })

  test('a wrong PIN applies for nothing', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await institution(suffix)
    const { user } = await createUserWithWallet({ email: `lnh-${randomUUID()}@test.com` })

    const res = await client
      .post('/api/v1/finance/loans')
      .loginAs(user)
      .json({ product_id: product.id, amount: '100000', pin: '9999' })

    assert.equal(res.status(), 401)
    const listed = await client.get('/api/v1/finance/loans').loginAs(user)
    assert.lengthOf(json(listed).data, 0)
  })
})
