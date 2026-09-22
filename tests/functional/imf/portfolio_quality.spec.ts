import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import Loan from '#models/loan'
import User from '#models/user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { LoanService } from '#services/lending/loan_service'
import { PortfolioQualityService } from '#services/lending/portfolio_quality_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * Portfolio at risk — the first figure a microfinance supervisor asks for.
 *
 * The property worth pinning is what PAR counts: the whole outstanding principal of every loan
 * with a payment overdue, never the overdue instalments alone. One missed payment on a twelve-month
 * loan puts the entire balance at risk, and measuring it the intuitive way would flatter every
 * book in the system by an order of magnitude — which is exactly the kind of error nobody notices
 * until a portfolio turns out to be far worse than reported.
 */
test.group('Portfolio quality', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `par-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function lender(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTPAR${suffix}`,
      name: `Institution ${suffix}`,
      email: `par${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `par-${suffix}`,
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
        code: `PAR${suffix}`,
        name: 'Credit commercant',
        kind: 'loan',
        currencyCode: 'USD',
        interestRateBps: 500,
        interestPeriod: 'month',
        interestMethod: 'flat',
        termMonthsMax: 6,
      },
      `par-${suffix}`
    )
    await FinancialProductService.submit(product, `par-${suffix}`)
    await FinancialProductService.approve(product, adminId, `par-${suffix}`)

    const officerUser = await User.create({
      fullName: `Officer ${suffix}`,
      email: `off-${randomUUID()}@example.test`,
      password: 'a-real-password',
    })
    const officer = await BusinessStaff.create({
      businessId: business.id,
      userId: officerUser.id,
      agentId: null,
      role: 'credit_officer',
      status: 'active',
    })

    return { business, product, officer }
  }

  /** A disbursed loan whose first instalment fell due `daysAgo` days ago and was never paid. */
  async function overdueLoan(
    productId: number,
    officer: BusinessStaff,
    principal: bigint,
    daysAgo: number | null,
    suffix: string
  ) {
    const { user } = await createUserWithWallet({ email: `par-${randomUUID()}@test.com` })
    const loan = await LoanService.request(user.id, productId, principal, `par-${suffix}`)
    await LoanService.approve(loan, officer, `par-${suffix}`)
    await LoanService.disburse(loan, `par-${suffix}`)

    if (daysAgo !== null) {
      // Pull the first instalment back into the past; the rest of the schedule follows it.
      const due = DateTime.now().minus({ days: daysAgo })
      await db
        .from('loan_schedules')
        .where('loan_id', loan.id)
        .where('installment', 1)
        .update({ due_at: due.toSQL() })
    }
    return loan
  }

  test('a book with nobody late is entirely at risk of nothing', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)
    await overdueLoan(product.id, officer, 1_000_00n, null, suffix)

    const report = await PortfolioQualityService.reportFor(business.id)

    assert.equal(report.grossPortfolio, 1_000_00n)
    assert.equal(report.loansOutstanding, 1)
    assert.equal(report.loansInArrears, 0)
    for (const bucket of report.par) {
      assert.equal(bucket.amount, 0n)
      assert.equal(bucket.ratioBps, 0)
    }
  })

  test('PAR counts the whole loan, not the missed instalment', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)

    // One loan 45 days late, one entirely current. Equal principals, so PAR30 must be 50%.
    await overdueLoan(product.id, officer, 1_000_00n, 45, suffix)
    await overdueLoan(product.id, officer, 1_000_00n, null, suffix)

    const report = await PortfolioQualityService.reportFor(business.id)
    const par30 = report.par.find((b) => b.days === 30)!

    // The missed instalment is about 216.67. Counting that instead would report roughly 10%.
    assert.equal(par30.amount, 1_000_00n, 'the entire balance of the late loan')
    assert.equal(par30.ratioBps, 5000, '50.00%')
    assert.equal(report.loansInArrears, 1)
  })

  test('the buckets separate how late people are', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)

    await overdueLoan(product.id, officer, 1_000_00n, 5, suffix)
    await overdueLoan(product.id, officer, 1_000_00n, 45, suffix)
    await overdueLoan(product.id, officer, 1_000_00n, 100, suffix)

    const report = await PortfolioQualityService.reportFor(business.id)
    const bucket = (days: number) => report.par.find((b) => b.days === days)!

    assert.equal(bucket(1).amount, 3_000_00n, 'all three are late at all')
    assert.equal(bucket(30).amount, 2_000_00n)
    assert.equal(bucket(60).amount, 1_000_00n)
    assert.equal(bucket(90).amount, 1_000_00n)
  })

  test('paying the overdue instalment takes a loan out of arrears', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)
    const loan = await overdueLoan(product.id, officer, 1_000_00n, 45, suffix)

    assert.lengthOf(await PortfolioQualityService.arrearsFor(business.id), 1)

    const borrowerWallet = await db.from('wallets').where('user_id', loan.userId).first()
    await db.from('wallets').where('id', borrowerWallet.id).update({ balance_cache: '500000' })
    await LoanService.repay(loan, 216_67n, `par-${suffix}`)

    assert.lengthOf(
      await PortfolioQualityService.arrearsFor(business.id),
      0,
      'caught up, so no longer at risk'
    )
  })

  test('marking defaults is a deliberate act that moves no money', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)
    const loan = await overdueLoan(product.id, officer, 1_000_00n, 120, suffix)

    // Reading the report changes nothing on its own.
    await PortfolioQualityService.reportFor(business.id)
    await loan.refresh()
    // Disbursed and untouched: `repaying` only starts at the first payment.
    assert.equal(loan.status, 'disbursed')

    const marked = await PortfolioQualityService.markDefaults(business.id, 90, `par-${suffix}`)
    assert.equal(marked, 1)

    await loan.refresh()
    assert.equal(loan.status, 'defaulted')
    // Nothing was written off: recovery stays possible and the balance is untouched.
    assert.equal(loan.principalOutstanding, 1_000_00n)
  })

  test('a loan less late than the policy is left alone', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)
    const loan = await overdueLoan(product.id, officer, 1_000_00n, 40, suffix)

    const marked = await PortfolioQualityService.markDefaults(business.id, 90, `par-${suffix}`)
    assert.equal(marked, 0)
    await loan.refresh()
    assert.notEqual(loan.status, 'defaulted')
  })

  test("one institution's arrears never reach another's report", async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await lender(suffix)
    const second = await lender(`${Number(suffix) + 1}`.slice(-8))

    await overdueLoan(first.product.id, first.officer, 1_000_00n, 60, suffix)

    const theirs = await PortfolioQualityService.reportFor(second.business.id)
    assert.equal(theirs.grossPortfolio, 0n)
    assert.equal(theirs.loansInArrears, 0)
    assert.lengthOf(await PortfolioQualityService.arrearsFor(second.business.id), 0)
  })

  test('a settled loan leaves the portfolio entirely', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix)
    const loan = await overdueLoan(product.id, officer, 100_00n, null, suffix)

    const borrowerWallet = await db.from('wallets').where('user_id', loan.userId).first()
    await db.from('wallets').where('id', borrowerWallet.id).update({ balance_cache: '500000' })
    await LoanService.repay(loan, loan.totalOutstanding, `par-${suffix}`)

    const reloaded = await Loan.findOrFail(loan.id)
    assert.equal(reloaded.status, 'repaid')

    const report = await PortfolioQualityService.reportFor(business.id)
    assert.equal(report.grossPortfolio, 0n)
    assert.equal(report.loansOutstanding, 0)
  })
})
