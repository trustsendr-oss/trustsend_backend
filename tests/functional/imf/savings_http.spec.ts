import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import InternalUser from '#models/internal_user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

const json = (res: { body(): unknown }) => res.body() as any

/**
 * Savings over real HTTP.
 *
 * What only a request exercises here is the PIN on every movement and the ownership check on every
 * route. Both stand between a caller and someone else's balance: without the second, an account id
 * would be enough to drain a stranger's savings into your own wallet, since the service moves money
 * to the primary wallet of whoever the account belongs to.
 *
 * Nothing is torn down — an append-only ledger forbids it once money has moved.
 */
test.group('Savings over HTTP', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `sav-http-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function product(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTSVH${suffix}`,
      name: `Institution ${suffix}`,
      email: `svh${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `svh-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    const created = await FinancialProductService.create(
      business.id,
      {
        code: `SVH${suffix}`,
        name: 'Epargne a vue',
        kind: 'savings',
        currencyCode: 'USD',
        interestRateBps: 300,
        interestPeriod: 'year',
      },
      `svh-${suffix}`
    )
    await FinancialProductService.submit(created, `svh-${suffix}`)
    await FinancialProductService.approve(created, adminId, `svh-${suffix}`)
    return created
  }

  test('a saver opens an account and sees their balance', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const { user } = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 500_00n,
    })

    const opened = await client
      .post('/api/v1/finance/savings')
      .loginAs(user)
      .json({ product_id: savingsProduct.id, initial_amount: '20000', pin: TEST_PIN })

    assert.equal(opened.status(), 201)
    assert.equal(json(opened).data.balance, '20000')
    assert.equal(json(opened).data.interest_rate_percent, 3)

    const listed = await client.get('/api/v1/finance/savings').loginAs(user)
    assert.equal(listed.status(), 200)
    assert.lengthOf(json(listed).data, 1)
  })

  test('a wrong PIN moves nothing', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 500_00n,
    })

    const res = await client
      .post('/api/v1/finance/savings')
      .loginAs(user)
      .json({ product_id: savingsProduct.id, initial_amount: '20000', pin: '9999' })

    assert.equal(res.status(), 401)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 500_00n, 'nothing left the spendable wallet')
  })

  test('deposits and withdrawals move the two balances together', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 500_00n,
    })

    const opened = await client
      .post('/api/v1/finance/savings')
      .loginAs(user)
      .json({ product_id: savingsProduct.id, pin: TEST_PIN })
    const id = json(opened).data.id

    const deposited = await client
      .post(`/api/v1/finance/savings/${id}/deposit`)
      .loginAs(user)
      .json({ amount: '30000', pin: TEST_PIN })
    assert.equal(deposited.status(), 200)
    assert.equal(json(deposited).data.balance, '30000')

    const withdrawn = await client
      .post(`/api/v1/finance/savings/${id}/withdraw`)
      .loginAs(user)
      .json({ amount: '10000', pin: TEST_PIN })
    assert.equal(withdrawn.status(), 200)
    assert.equal(json(withdrawn).data.balance, '20000')

    await wallet.refresh()
    // 500.00 opening, 300.00 saved, 100.00 taken back out.
    assert.equal(wallet.balanceCache, 300_00n)
  })

  test('withdrawing more than the account holds is refused', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const { user } = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 100_00n,
    })

    const opened = await client
      .post('/api/v1/finance/savings')
      .loginAs(user)
      .json({ product_id: savingsProduct.id, initial_amount: '10000', pin: TEST_PIN })
    const id = json(opened).data.id

    const res = await client
      .post(`/api/v1/finance/savings/${id}/withdraw`)
      .loginAs(user)
      .json({ amount: '50000', pin: TEST_PIN })

    assert.equal(res.status(), 402)
  })

  test("another saver's account does not exist for you", async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const owner = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 300_00n,
    })
    const stranger = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const opened = await client
      .post('/api/v1/finance/savings')
      .loginAs(owner.user)
      .json({ product_id: savingsProduct.id, initial_amount: '30000', pin: TEST_PIN })
    const id = json(opened).data.id

    // Without the ownership check this would sweep someone else's savings into the caller's wallet.
    const peek = await client.get(`/api/v1/finance/savings/${id}`).loginAs(stranger.user)
    assert.equal(peek.status(), 404)

    const raid = await client
      .post(`/api/v1/finance/savings/${id}/withdraw`)
      .loginAs(stranger.user)
      .json({ amount: '30000', pin: TEST_PIN })
    assert.equal(raid.status(), 404)

    await stranger.wallet.refresh()
    assert.equal(stranger.wallet.balanceCache, 0n, 'not a cent moved')

    const balance = await db.from('savings_accounts').where('id', id).first()
    const escrow = await db.from('wallets').where('id', balance.wallet_id).first()
    assert.equal(BigInt(escrow.balance_cache), 30000n, 'the owner still has it all')
  })

  test('closing returns everything and shuts the account', async ({ client, assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const savingsProduct = await product(suffix)
    const { user, wallet } = await createUserWithWallet({
      email: `svh-${randomUUID()}@test.com`,
      balance: 250_00n,
    })

    const opened = await client
      .post('/api/v1/finance/savings')
      .loginAs(user)
      .json({ product_id: savingsProduct.id, initial_amount: '25000', pin: TEST_PIN })
    const id = json(opened).data.id

    const closed = await client
      .post(`/api/v1/finance/savings/${id}/close`)
      .loginAs(user)
      .json({ pin: TEST_PIN })

    assert.equal(closed.status(), 200)
    assert.equal(json(closed).data.status, 'closed')
    assert.equal(json(closed).data.balance, '0')

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 250_00n, 'every cent came back')
  })
})
