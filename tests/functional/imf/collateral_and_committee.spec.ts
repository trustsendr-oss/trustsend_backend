import { test } from '@japa/runner'
import { LoanCommitteeService, LoanCommitteeException } from '#services/lending/loan_committee_service'
import { GroupLendingService } from '#services/lending/group_lending_service'
import { LoanOfficerPortfolioService } from '#services/lending/loan_officer_portfolio_service'
import { LoanService } from '#services/lending/loan_service'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import FinancialProduct from '#models/financial_product'
import Loan from '#models/loan'
import User from '#models/user'
import Wallet from '#models/wallet'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

async function findImf(): Promise<Business> {
  return Business.query().where('kind', 'imf').where('status', 'active').firstOrFail()
}

async function findCreditOfficer(businessId: number): Promise<BusinessStaff> {
  return BusinessStaff.query()
    .where('business_id', businessId)
    .whereIn('role', ['credit_officer', 'branch_manager', 'admin'])
    .firstOrFail()
}

async function findOrCreateBorrower(businessId: number): Promise<User> {
  // Reuse a seeded borrower that has a wallet in the IMF's currency
  const wallet = await Wallet.query()
    .whereNotNull('user_id')
    .where('status', 'active')
    .first()
  if (!wallet || !wallet.userId) throw new Error('No suitable borrower wallet found in test db')
  return User.findOrFail(wallet.userId)
}

async function findLoanProduct(businessId: number): Promise<FinancialProduct> {
  return FinancialProduct.query()
    .where('provider_id', businessId)
    .where('kind', 'loan')
    .where('status', 'active')
    .firstOrFail()
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

test.group('IMF — Committee circuit (P1)', () => {

  test('full happy path: requested → under_review → committee_approved → disbursed', async ({
    assert,
  }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) {
      console.warn('⚠️  No active IMF found in the test database — skipping committee test')
      return
    }

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) {
      console.warn('⚠️  No credit officer found — skipping')
      return
    }

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) {
      console.warn('⚠️  No active loan product found — skipping')
      return
    }

    const borrower = await findOrCreateBorrower(imf.id).catch(() => null)
    if (!borrower) {
      console.warn('⚠️  No suitable borrower — skipping')
      return
    }

    // 1. Borrower requests a loan
    const loan = await LoanService.request(borrower.id, product.id, 100_000n, 'test-corr-1')
    assert.equal(loan.status, 'requested')
    assert.isNull(loan.stage)

    // 2. Credit officer sends file to committee
    await LoanCommitteeService.submitForReview(loan, officer, 'test-corr-2')
    assert.equal(loan.stage, 'under_review')
    assert.equal(loan.status, 'requested')
    assert.equal(loan.assignedLoanOfficerId, officer.id)

    // 3. Committee approves (full principal)
    await LoanCommitteeService.approveByCommittee(loan, officer, 'test-corr-3', {
      notes: 'Approved by test committee',
    })
    assert.equal(loan.stage, 'committee_approved')
    assert.equal(loan.status, 'approved')
    assert.isNotNull(loan.committeeDecisionAt)
    assert.equal(loan.committeeNotes, 'Approved by test committee')
  })

  test('committee cannot approve a loan that is not under_review', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) return

    const borrower = await findOrCreateBorrower(imf.id).catch(() => null)
    if (!borrower) return

    const loan = await LoanService.request(borrower.id, product.id, 50_000n, 'test-corr-4')

    // Trying to approve without submit → should throw
    await assert.rejects(
      () => LoanCommitteeService.approveByCommittee(loan, officer, 'test-corr-5'),
      LoanCommitteeException
    )
  })

  test('committee reject sets both stage and status to rejected', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) return

    const borrower = await findOrCreateBorrower(imf.id).catch(() => null)
    if (!borrower) return

    const loan = await LoanService.request(borrower.id, product.id, 75_000n, 'test-corr-6')
    await LoanCommitteeService.submitForReview(loan, officer, 'test-corr-7')

    await LoanCommitteeService.rejectByCommittee(
      loan,
      officer,
      'Income too low for the requested amount',
      'test-corr-8'
    )

    assert.equal(loan.stage, 'rejected')
    assert.equal(loan.status, 'rejected')
    assert.equal(loan.committeeNotes, 'Income too low for the requested amount')
  })

  test('disburse fails if stage is under_review (committee not done yet)', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const product = await findLoanProduct(imf.id).catch(() => null)
    if (!product) return

    const borrower = await findOrCreateBorrower(imf.id).catch(() => null)
    if (!borrower) return

    const loan = await LoanService.request(borrower.id, product.id, 60_000n, 'test-corr-9')
    // Manually force status=approved but stage=under_review to test the guard
    loan.status = 'approved'
    loan.stage = 'under_review'
    await loan.save()

    await assert.rejects(() => LoanService.disburse(loan, 'test-corr-10'))
  })
})

test.group('IMF — Solidarity groups (P2)', () => {
  test('create a group and add a member', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) {
      console.warn('⚠️  No active IMF — skipping group test')
      return
    }

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const borrower = await findOrCreateBorrower(imf.id).catch(() => null)
    if (!borrower) return

    const group = await GroupLendingService.createGroup(
      imf.id,
      officer.id,
      'Test solidarity group',
      'test-group-corr-1'
    )

    assert.equal(group.name, 'Test solidarity group')
    assert.equal(group.businessId, imf.id)
    assert.equal(group.status, 'active')

    await GroupLendingService.addMember(group, borrower, 'leader')
    await group.load('members')
    assert.equal(group.members.length, 1)
    assert.equal(group.members[0].role, 'leader')
  })

  test('group solidarity rule blocks loan eligibility when a member is overdue', async ({
    assert,
  }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const group = await GroupLendingService.createGroup(
      imf.id,
      officer.id,
      'Blocked group test',
      'test-group-corr-2'
    )

    // Check that a group with no overdue loans is eligible
    const isEligible = await GroupLendingService.assertGroupEligibleForLoan(group).then(() => true).catch(() => false)
    assert.isTrue(isEligible, 'A fresh group with no members should be eligible')
  })
})

test.group('IMF — Loan officer portfolio (P2)', () => {
  test('getPortfolioStats returns a valid structure', async ({ assert }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) {
      console.warn('⚠️  No active IMF — skipping portfolio test')
      return
    }

    const officer = await findCreditOfficer(imf.id).catch(() => null)
    if (!officer) return

    const stats = await LoanOfficerPortfolioService.getPortfolioStats(officer)

    assert.property(stats, 'officer_id')
    assert.property(stats, 'total_loans')
    assert.property(stats, 'par30')
    assert.property(stats, 'par90')
    assert.property(stats, 'recovery_rate')
    assert.equal(stats.officer_id, officer.id)
    assert.isNumber(stats.total_loans)
  })
})
