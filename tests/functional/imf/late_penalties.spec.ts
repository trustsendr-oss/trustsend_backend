import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import LoanPenalty from '#models/loan_penalty'
import User from '#models/user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { LoanService } from '#services/lending/loan_service'
import { PenaltyService } from '#services/lending/penalty_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * Late charges.
 *
 * Three things are pinned. The basis matters as much as the rate — the same 2% on an overdue
 * instalment and on a whole outstanding principal differ by an order of magnitude, which is why
 * the product states which. The job is safe to re-run, like every unattended job here. And a
 * payment clears penalties before anything else, because an unpaid penalty keeps growing: letting
 * it stand while principal is repaid would have the borrower paying down a balance whose charge
 * compounds behind them.
 */
test.group('Late penalties', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `pen-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function lender(
    suffix: string,
    penalty: {
      rateBps?: number | null
      basis?: 'overdue_amount' | 'outstanding_principal' | null
      graceDays?: number
    } = {}
  ) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTPEN${suffix}`,
      name: `Institution ${suffix}`,
      email: `pen${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `pen-${suffix}`,
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
        code: `PEN${suffix}`,
        name: 'Credit commercant',
        kind: 'loan',
        currencyCode: 'USD',
        interestRateBps: 500,
        interestPeriod: 'month',
        interestMethod: 'flat',
        termMonthsMax: 6,
      },
      `pen-${suffix}`
    )
    // Penalty terms go straight on the row: the catalogue API for them is a separate concern.
    await db
      .from('financial_products')
      .where('id', product.id)
      .update({
        penalty_rate_bps: penalty.rateBps === undefined ? 200 : penalty.rateBps,
        penalty_basis: penalty.basis === undefined ? 'overdue_amount' : penalty.basis,
        penalty_grace_days: penalty.graceDays ?? 0,
      })
    await product.refresh()

    await FinancialProductService.submit(product, `pen-${suffix}`)
    await FinancialProductService.approve(product, adminId, `pen-${suffix}`)

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

  async function lateLoan(
    productId: number,
    officer: BusinessStaff,
    daysLate: number,
    suffix: string,
    principal = 1_000_00n
  ) {
    const { user, wallet } = await createUserWithWallet({ email: `pen-${randomUUID()}@test.com` })
    const loan = await LoanService.request(user.id, productId, principal, `pen-${suffix}`)
    await LoanService.approve(loan, officer, `pen-${suffix}`)
    await LoanService.disburse(loan, `pen-${suffix}`)

    await db
      .from('loan_schedules')
      .where('loan_id', loan.id)
      .where('installment', 1)
      .update({ due_at: DateTime.now().minus({ days: daysLate }).toSQL() })

    await loan.refresh()
    return { loan, wallet }
  }

  const thisPeriod = () => PenaltyService.periodKeyFor(DateTime.now())

  test('the penalty terms are copied onto the loan', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { rateBps: 200, graceDays: 5 })
    const { loan } = await lateLoan(product.id, officer, 0, suffix)

    assert.equal(loan.penaltyRateBps, 200)
    assert.equal(loan.penaltyBasis, 'overdue_amount')
    assert.equal(loan.penaltyGraceDays, 5)
    assert.equal(loan.penaltiesOutstanding, 0n)
  })

  test('a charge on the overdue amount stays proportionate', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { rateBps: 200, basis: 'overdue_amount' })
    const { loan } = await lateLoan(product.id, officer, 10, suffix)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()

    // First instalment is 216.67; 2% of it is 4.33.
    assert.equal(loan.penaltiesOutstanding, 4_33n)
  })

  test('the same rate on the principal is an order of magnitude bigger', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, {
      rateBps: 200,
      basis: 'outstanding_principal',
    })
    const { loan } = await lateLoan(product.id, officer, 10, suffix)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()

    // 2% of 1000.00 outstanding — twenty times the charge on the instalment. This is exactly why
    // the product has to say which basis it means.
    assert.equal(loan.penaltiesOutstanding, 20_00n)
  })

  test('nobody inside the grace period is charged', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { graceDays: 5 })
    const { loan } = await lateLoan(product.id, officer, 3, suffix)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()
    assert.equal(loan.penaltiesOutstanding, 0n, 'three days late on five days grace')

    // A day past the grace period, the charge lands.
    const { loan: later } = await lateLoan(product.id, officer, 6, suffix + '1')
    await PenaltyService.chargeOne(later, thisPeriod(), `pen-${suffix}`)
    await later.refresh()
    assert.isAbove(Number(later.penaltiesOutstanding), 0)
  })

  test('a loan that is up to date is never charged', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix)
    const { user } = await createUserWithWallet({ email: `pen-${randomUUID()}@test.com` })

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `pen-${suffix}`)
    await LoanService.approve(loan, officer, `pen-${suffix}`)
    await LoanService.disburse(loan, `pen-${suffix}`)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()
    assert.equal(loan.penaltiesOutstanding, 0n)
  })

  test('running it twice charges nothing a second time', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix)
    const { loan } = await lateLoan(product.id, officer, 10, suffix)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()
    const afterFirst = loan.penaltiesOutstanding

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()

    assert.equal(loan.penaltiesOutstanding, afterFirst)
    assert.lengthOf(await LoanPenalty.query().where('loan_id', loan.id), 1)
  })

  test('a product with no penalty clause charges nothing', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { rateBps: null, basis: null })
    const { loan } = await lateLoan(product.id, officer, 60, suffix)

    assert.isNull(loan.penaltyRateBps)
    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()
    assert.equal(loan.penaltiesOutstanding, 0n)
  })

  test('a payment clears the penalty before anything else', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { rateBps: 200 })
    const { loan, wallet } = await lateLoan(product.id, officer, 10, suffix)

    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()
    assert.equal(loan.penaltiesOutstanding, 4_33n)

    await db.from('wallets').where('id', wallet.id).update({ balance_cache: '500000' })
    await LoanService.repay(loan, 10_00n, `pen-${suffix}`)

    const repayment = await db.from('loan_repayments').where('loan_id', loan.id).first()
    assert.equal(BigInt(repayment.applied_to_penalties), 4_33n)
    // What was left went on interest, which is the next claim.
    assert.equal(BigInt(repayment.applied_to_interest), 5_67n)
    assert.equal(BigInt(repayment.applied_to_principal), 0n)

    await loan.refresh()
    assert.equal(loan.penaltiesOutstanding, 0n)
  })

  test('what is owed includes the late charges', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, {
      rateBps: 200,
      basis: 'outstanding_principal',
    })
    const { loan } = await lateLoan(product.id, officer, 10, suffix)

    const before = loan.totalOutstanding
    await PenaltyService.chargeOne(loan, thisPeriod(), `pen-${suffix}`)
    await loan.refresh()

    assert.equal(loan.totalOutstanding, before + 20_00n)
  })

  test('a defaulted loan keeps accruing what it owes', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix)
    const { loan } = await lateLoan(product.id, officer, 120, suffix)

    loan.status = 'defaulted'
    await loan.save()

    // Writing a loan off does not forgive it: recovery stays possible, and so does the charge.
    const outcome = await PenaltyService.runForPeriod(DateTime.now(), `pen-${suffix}`)
    assert.isAtLeast(outcome.loansConsidered, 1)

    const charged = await LoanPenalty.query().where('loan_id', loan.id).first()
    assert.isNotNull(charged)
  })

  test('the database refuses a rate with no basis', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await lender(suffix)

    await assert.rejects(() =>
      db
        .from('financial_products')
        .where('id', product.id)
        .update({ penalty_rate_bps: 500, penalty_basis: null })
    )
  })

  test('one institution charges do not touch another', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await lender(suffix)
    const second = await lender(`${Number(suffix) + 1}`.slice(-8), { rateBps: null, basis: null })

    const { loan: theirs } = await lateLoan(first.product.id, first.officer, 30, suffix)
    const { loan: ours } = await lateLoan(second.product.id, second.officer, 30, suffix + '2')

    await PenaltyService.runForPeriod(DateTime.now(), `pen-${suffix}`)

    await theirs.refresh()
    await ours.refresh()
    assert.isAbove(Number(theirs.penaltiesOutstanding), 0)
    assert.equal(ours.penaltiesOutstanding, 0n, 'no clause, no charge')
  })
})
