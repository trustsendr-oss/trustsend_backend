import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import User from '#models/user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { LoanService } from '#services/lending/loan_service'
import { SavingsService } from '#services/savings/savings_service'
import { RegulatoryReportService } from '#services/reporting/regulatory_report_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * The figures a microfinance return is assembled from.
 *
 * The failure mode worth guarding against is a number that is silently zero. A missing figure gets
 * noticed; a zero looks like a quiet month and gets filed. The first version of the activity
 * section read `metadata ->> 'provider_id'` on disbursement transactions, a key that was never
 * set, and reported no disbursements at all for an institution that had made three — the tests
 * below exist because that is exactly the kind of error nobody catches by reading the code.
 */
test.group('Regulatory position', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `reg-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function institution(suffix: string) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTREG${suffix}`,
      name: `Institution ${suffix}`,
      email: `reg${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `reg-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()
    await db
      .from('wallets')
      .where('business_id', business.id)
      .update({ balance_cache: '100000000' })

    const make = async (kind: 'savings' | 'loan') => {
      const product = await FinancialProductService.create(
        business.id,
        {
          code: `${kind.toUpperCase()}${suffix}`,
          name: kind === 'savings' ? 'Epargne a vue' : 'Credit commercant',
          kind,
          currencyCode: 'USD',
          interestRateBps: kind === 'savings' ? 300 : 500,
          interestPeriod: kind === 'savings' ? 'year' : 'month',
          interestMethod: kind === 'loan' ? 'flat' : null,
          termMonthsMax: kind === 'loan' ? 6 : null,
        },
        `reg-${suffix}`
      )
      await FinancialProductService.submit(product, `reg-${suffix}`)
      await FinancialProductService.approve(product, adminId, `reg-${suffix}`)
      return product
    }

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

    return { business, savings: await make('savings'), credit: await make('loan'), officer }
  }

  test('deposits owed are counted, per product and per saver', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, savings } = await institution(suffix)

    for (const amount of [100_00n, 250_00n]) {
      const { user } = await createUserWithWallet({
        email: `reg-${randomUUID()}@test.com`,
        balance: 1_000_00n,
      })
      await SavingsService.open(user.id, savings.id, {
        initialAmount: amount,
        correlationId: `reg-${suffix}`,
      })
    }

    const report = await RegulatoryReportService.positionFor(business.id)

    assert.equal(report.deposits.accounts, 2)
    assert.equal(report.deposits.savers, 2)
    assert.equal(report.deposits.balance, 350_00n)
    assert.lengthOf(report.deposits.byProduct, 1)
    assert.equal(report.deposits.byProduct[0].balance, 350_00n)
  })

  test('the loan book is reported with its arrears', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, credit, officer } = await institution(suffix)

    for (let i = 0; i < 2; i++) {
      const { user } = await createUserWithWallet({ email: `reg-${randomUUID()}@test.com` })
      const loan = await LoanService.request(user.id, credit.id, 1_000_00n, `reg-${suffix}`)
      await LoanService.approve(loan, officer, `reg-${suffix}`)
      await LoanService.disburse(loan, `reg-${suffix}`)
    }

    const report = await RegulatoryReportService.positionFor(business.id)

    assert.equal(report.loans.outstanding, 2)
    assert.equal(report.loans.borrowers, 2)
    // Gross portfolio is principal: interest not yet due is not an asset a supervisor counts.
    assert.equal(report.loans.grossPortfolio, 2_000_00n)
    assert.equal(report.loans.interestOutstanding, 600_00n)
    assert.isArray(report.quality)
  })

  test('disbursements are reported, not silently zero', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, credit, officer } = await institution(suffix)

    const { user } = await createUserWithWallet({ email: `reg-${randomUUID()}@test.com` })
    const loan = await LoanService.request(user.id, credit.id, 1_000_00n, `reg-${suffix}`)
    await LoanService.approve(loan, officer, `reg-${suffix}`)
    await LoanService.disburse(loan, `reg-${suffix}`)

    const report = await RegulatoryReportService.positionFor(business.id, 'USD', {
      since: DateTime.now().minus({ days: 1 }),
    })

    // The figure that was zero before: a quiet month and a broken query look identical on a form.
    assert.equal(report.activity.disbursements, 1)
    assert.equal(report.activity.disbursed, 1_000_00n)
  })

  test('repayments and savings movement are reported too', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, credit, savings, officer } = await institution(suffix)

    const borrower = await createUserWithWallet({ email: `reg-${randomUUID()}@test.com` })
    const loan = await LoanService.request(borrower.user.id, credit.id, 1_000_00n, `reg-${suffix}`)
    await LoanService.approve(loan, officer, `reg-${suffix}`)
    await LoanService.disburse(loan, `reg-${suffix}`)
    await db.from('wallets').where('id', borrower.wallet.id).update({ balance_cache: '500000' })
    await LoanService.repay(loan, 216_67n, `reg-${suffix}`)

    const saver = await createUserWithWallet({
      email: `reg-${randomUUID()}@test.com`,
      balance: 1_000_00n,
    })
    const account = await SavingsService.open(saver.user.id, savings.id, {
      initialAmount: 300_00n,
      correlationId: `reg-${suffix}`,
    })
    await SavingsService.withdraw(account, 50_00n, `reg-${suffix}`)

    const report = await RegulatoryReportService.positionFor(business.id, 'USD', {
      since: DateTime.now().minus({ days: 1 }),
    })

    assert.equal(report.activity.repayments, 1)
    assert.equal(report.activity.repaid, 216_67n)
    assert.equal(report.activity.depositsTaken, 300_00n)
    assert.equal(report.activity.withdrawalsPaid, 50_00n)
  })

  test('liquidity separates the operating wallet from counter floats', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business } = await institution(suffix)

    const report = await RegulatoryReportService.positionFor(business.id)
    assert.equal(report.cash.operating, 1_000_000_00n)
    assert.equal(report.cash.branchFloats, 0n)
    assert.equal(report.cash.total, report.cash.operating + report.cash.branchFloats)
  })

  test("one institution's figures never include another's", async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await institution(suffix)
    const second = await institution(`${Number(suffix) + 1}`.slice(-8))

    const { user } = await createUserWithWallet({
      email: `reg-${randomUUID()}@test.com`,
      balance: 1_000_00n,
    })
    await SavingsService.open(user.id, first.savings.id, {
      initialAmount: 500_00n,
      correlationId: `reg-${suffix}`,
    })

    const theirs = await RegulatoryReportService.positionFor(second.business.id)
    assert.equal(theirs.deposits.balance, 0n)
    assert.equal(theirs.deposits.accounts, 0)
    assert.equal(theirs.loans.grossPortfolio, 0n)
  })

  test('a currency is reported on its own, never summed with another', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, savings } = await institution(suffix)

    const { user } = await createUserWithWallet({
      email: `reg-${randomUUID()}@test.com`,
      balance: 1_000_00n,
    })
    await SavingsService.open(user.id, savings.id, {
      initialAmount: 400_00n,
      correlationId: `reg-${suffix}`,
    })

    const usd = await RegulatoryReportService.positionFor(business.id, 'USD')
    const cdf = await RegulatoryReportService.positionFor(business.id, 'CDF')

    assert.equal(usd.deposits.balance, 400_00n)
    // Two currencies are two returns: a supervisor would not accept their sum.
    assert.equal(cdf.deposits.balance, 0n)
    assert.equal(cdf.currencyCode, 'CDF')
  })

  test('a defaulted loan is reported apart from the performing book', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, credit, officer } = await institution(suffix)

    const { user } = await createUserWithWallet({ email: `reg-${randomUUID()}@test.com` })
    const loan = await LoanService.request(user.id, credit.id, 1_000_00n, `reg-${suffix}`)
    await LoanService.approve(loan, officer, `reg-${suffix}`)
    await LoanService.disburse(loan, `reg-${suffix}`)

    loan.status = 'defaulted'
    await loan.save()

    const report = await RegulatoryReportService.positionFor(business.id)
    assert.equal(report.loans.defaulted.count, 1)
    assert.equal(report.loans.defaulted.principal, 1_000_00n)
    assert.equal(report.loans.outstanding, 0, 'counted apart from the performing book')
  })
})
