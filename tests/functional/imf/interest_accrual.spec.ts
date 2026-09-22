import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InterestAccrual from '#models/interest_accrual'
import InternalUser from '#models/internal_user'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { InterestAccrualService } from '#services/savings/interest_accrual_service'
import { SavingsService } from '#services/savings/savings_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * Paying savers their interest, unattended.
 *
 * Two properties carry the weight. The job must be safe to run twice — a retry or a duplicated
 * cron paying everybody a second time is an incident, where a figure slightly off is a correction.
 * And it must pay on the LOWEST balance of the period, or anyone could deposit the evening before
 * accrual, collect a month's interest and withdraw the next morning at the institution's expense.
 *
 * Nothing is torn down: an append-only ledger forbids it once money has moved.
 */
test.group('Savings interest accrual', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `acc-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function setUp(suffix: string, rateBps = 1200, period: 'month' | 'year' = 'year') {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTACC${suffix}`,
      name: `Institution ${suffix}`,
      email: `acc${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `acc-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()
    await db
      .from('wallets')
      .where('business_id', business.id)
      .update({ balance_cache: '100000000' })

    const product = await FinancialProductService.create(
      business.id,
      {
        code: `ACC${suffix}`,
        name: 'Epargne a vue',
        kind: 'savings',
        currencyCode: 'USD',
        interestRateBps: rateBps,
        interestPeriod: period,
      },
      `acc-${suffix}`
    )
    await FinancialProductService.submit(product, `acc-${suffix}`)
    await FinancialProductService.approve(product, adminId, `acc-${suffix}`)

    return { business, product }
  }

  function saver(balance = 50_000_00n) {
    return createUserWithWallet({ email: `acc-${randomUUID()}@test.com`, balance })
  }

  /** The period under test is the current month, so movements made now fall inside it. */
  const thisMonth = () => DateTime.now()

  test('interest is paid from the institution to the saver', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product } = await setUp(suffix, 1200, 'year')
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 1_200_00n,
      correlationId: `acc-${suffix}`,
    })

    const outcome = await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)
    assert.isAtLeast(outcome.accountsPaid, 1)
    // Scoped to this account: the run sweeps every account in the database, so other specs'
    // institutions legitimately turn up among the failures and say nothing about this one.
    assert.notInclude(
      outcome.failures.map((f) => f.savingsAccountId),
      account.id
    )

    // 12% a year on 1200.00 is 1% a month = 12.00.
    assert.equal(await SavingsService.balanceOf(account), 1_212_00n)

    const lenderWallet = await Wallet.query().where('business_id', business.id).firstOrFail()
    assert.equal(lenderWallet.balanceCache, 999_988_00n, 'the institution paid it, not TumaPlus')
  })

  test('running it twice pays nothing a second time', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await setUp(suffix)
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 1_200_00n,
      correlationId: `acc-${suffix}`,
    })

    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)
    const afterFirst = await SavingsService.balanceOf(account)

    // A retry, a duplicated cron, an operator running last night's job again.
    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)
    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)

    assert.equal(await SavingsService.balanceOf(account), afterFirst, 'paid exactly once')

    const accruals = await InterestAccrual.query().where('savings_account_id', account.id)
    assert.lengthOf(accruals, 1)
  })

  test('the lowest balance of the period is what earns', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await setUp(suffix, 1200, 'year')
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 100_00n,
      correlationId: `acc-${suffix}`,
    })

    // The trick: park a large sum just before accrual and take it straight back out afterwards.
    await SavingsService.deposit(account, 10_000_00n, `acc-${suffix}`)

    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)

    const accrual = await InterestAccrual.query()
      .where('savings_account_id', account.id)
      .firstOrFail()

    // Earned on 100.00, the lowest the account ever held — not on 10 100.00.
    assert.equal(accrual.balanceUsed, 100_00n)
    assert.equal(accrual.amount, 1_00n, '1% of 100.00, not of the parked sum')
  })

  test('the rate is the one on the account, not the product today', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await setUp(suffix, 1200, 'year')
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 1_200_00n,
      correlationId: `acc-${suffix}`,
    })

    // The institution cuts its published rate to almost nothing.
    await db.from('financial_products').where('id', product.id).update({ interest_rate_bps: 10 })

    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)
    const accrual = await InterestAccrual.query()
      .where('savings_account_id', account.id)
      .firstOrFail()

    assert.equal(accrual.rateBps, 1200, 'what the saver was promised')
    assert.equal(accrual.amount, 12_00n)
  })

  test('an institution that cannot pay is reported, not skipped quietly', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product } = await setUp(suffix)
    const { user } = await saver()

    await SavingsService.open(user.id, product.id, {
      initialAmount: 1_200_00n,
      correlationId: `acc-${suffix}`,
    })
    // Drain the lender. A rate nobody can honour is something a supervisor has to see.
    await db.from('wallets').where('business_id', business.id).update({ balance_cache: '0' })

    const outcome = await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)
    const failure = outcome.failures.find((f) => f.reason.includes('cannot cover'))
    assert.isDefined(failure)
  })

  test('an empty account closes its period without a posting', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await setUp(suffix)
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      correlationId: `acc-${suffix}`,
    })

    await InterestAccrualService.runForPeriod(thisMonth(), `acc-${suffix}`)

    const accrual = await InterestAccrual.query()
      .where('savings_account_id', account.id)
      .firstOrFail()
    assert.equal(accrual.amount, 0n)
    assert.isNull(accrual.ledgerTransactionId, 'nothing posted for nothing')
  })
})
