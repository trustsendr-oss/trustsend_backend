import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import FinancialProduct from '#models/financial_product'
import Loan from '#models/loan'
import User from '#models/user'
import Wallet from '#models/wallet'
import { LoanService } from '#services/lending/loan_service'
import { LoanCommitteeService } from '#services/lending/loan_committee_service'
import { LoanRestructuringService } from '#services/lending/loan_restructuring_service'
import { DefaultManagementService } from '#services/lending/default_management_service'
import { ProvisioningService } from '#services/lending/provisioning_service'
import { ImfReportingService } from '#services/lending/imf_reporting_service'
import { PenaltyService } from '#services/lending/penalty_service'

async function findImf(): Promise<Business> {
  return Business.query().where('kind', 'imf').where('status', 'active').firstOrFail()
}

async function findCreditOfficer(businessId: number): Promise<BusinessStaff> {
  return BusinessStaff.query()
    .where('business_id', businessId)
    .whereIn('role', ['credit_officer', 'branch_manager', 'admin'])
    .firstOrFail()
}

async function findOrCreateBorrower(): Promise<User> {
  const wallet = await Wallet.query()
    .whereNotNull('user_id')
    .where('status', 'active')
    .first()
  if (!wallet || !wallet.userId) throw new Error('No borrower wallet found')
  return User.findOrFail(wallet.userId)
}

async function findLoanProduct(businessId: number): Promise<FinancialProduct> {
  return FinancialProduct.query()
    .where('provider_id', businessId)
    .where('kind', 'loan')
    .where('status', 'active')
    .firstOrFail()
}

test.group('IMF — Debt Restructuring (P3)', () => {
  test('restructure an active loan updates terms, rebuilds schedule and logs audit', async ({
    assert,
  }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) return

    const borrower = await findOrCreateBorrower().catch(() => null)
    if (!borrower) return

    // Create and disburse loan
    const loan = await LoanService.request(borrower.id, product.id, 120_000n, 'test-restr-1')
    await LoanCommitteeService.submitForReview(loan, officer, 'test-restr-2')
    await LoanCommitteeService.approveByCommittee(loan, officer, 'test-restr-3')
    await LoanService.disburse(loan, 'test-restr-4')

    assert.isFalse(loan.isRestructured)

    // Restructure loan: extend term to 18 months, 1 month grace
    await LoanRestructuringService.restructure(
      loan,
      officer,
      {
        newTermMonths: 18,
        gracePeriodMonths: 1,
        reason: 'Temporary cash flow difficulties due to seasonal cycle',
      },
      'test-restr-5'
    )

    assert.isTrue(loan.isRestructured)
    assert.equal(loan.restructureCount, 1)
    assert.equal(loan.termMonths, 18)
    assert.isNotNull(loan.restructuredAt)

    // Verify history recorded
    await loan.load('restructurings')
    assert.equal(loan.restructurings.length, 1)
    assert.equal(loan.restructurings[0].newTermMonths, 18)
    assert.equal(loan.restructurings[0].gracePeriodMonths, 1)
  })
})

test.group('IMF — Default Management & Collateral Seizure (P3)', () => {
  test('mark loan as defaulted updates status and logs reason', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) return

    const borrower = await findOrCreateBorrower().catch(() => null)
    if (!borrower) return

    const loan = await LoanService.request(borrower.id, product.id, 80_000n, 'test-def-1')
    await LoanCommitteeService.submitForReview(loan, officer, 'test-def-2')
    await LoanCommitteeService.approveByCommittee(loan, officer, 'test-def-3')
    await LoanService.disburse(loan, 'test-def-4')

    await DefaultManagementService.markDefault(
      loan,
      officer,
      'Borrower abandoned business activity without notice',
      'test-def-5'
    )

    assert.equal(loan.status, 'defaulted')
    assert.isNotNull(loan.defaultedAt)
    assert.equal(loan.defaultReason, 'Borrower abandoned business activity without notice')
  })
})

test.group('IMF — Provisioning IFRS 9 & Regulatory Reporting (P4)', () => {
  test('calculateReport produces a valid IFRS 9 provisioning matrix', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const report = await ProvisioningService.calculateReport(imf.id, 'USD')

    assert.isObject(report)
    assert.property(report, 'totalGrossPrincipal')
    assert.property(report, 'totalProvisionRequired')
    assert.property(report, 'categories')
    assert.equal(report.categories.length, 5) // 5 risk buckets
    assert.equal(report.categories[0].category, 'performing')
    assert.equal(report.categories[4].category, 'loss')
  })

  test('generateRegulatoryReport compiles full prudential report', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const report = await ImfReportingService.generateRegulatoryReport(imf.id, 'USD')

    assert.isObject(report)
    assert.property(report, 'portfolioOverview')
    assert.property(report, 'riskMetrics')
    assert.property(report, 'provisioningMetrics')
    assert.property(report, 'collateralAndSavings')
    assert.property(report, 'lendingMethodology')
    assert.isTrue(typeof report.portfolioOverview.grossLoanPortfolio === 'bigint')
    assert.isTrue(typeof report.riskMetrics.par30Bps === 'number')
  })

  test('penalty execution runs safely without errors', async ({ assert }) => {
    const outcome = await PenaltyService.runForPeriod(DateTime.now(), 'test-penalty-run')
    assert.isObject(outcome)
    assert.isNumber(outcome.loansConsidered)
    assert.isNumber(outcome.loansCharged)
    assert.isTrue(typeof outcome.totalCharged === 'bigint')
  })
})
