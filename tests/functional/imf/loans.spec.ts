import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import LoanSchedule from '#models/loan_schedule'
import User from '#models/user'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { LoanService } from '#services/lending/loan_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * A loan from application to settlement.
 *
 * The institution lends and is repaid; TumaPlus is the rail and the record. Two properties are
 * asserted with figures anyone can check on paper: the schedule written at disbursement matches
 * the method quoted, and a borrower who pays every instalment owes exactly nothing — no cent
 * invented, none lost.
 *
 * Nothing is torn down: an append-only ledger forbids it once money has moved.
 */
test.group('Loans', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `loan-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function lender(
    suffix: string,
    overrides: Partial<{
      method: 'flat' | 'declining'
      rateBps: number
      termMonths: number
      feeFlat: bigint | null
      feePercentBps: number | null
      minAmount: bigint | null
      maxAmount: bigint | null
      capital: bigint
    }> = {}
  ) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTLN${suffix}`,
      name: `Institution ${suffix}`,
      email: `ln${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `ln-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    // The institution lends its own money, so it needs some.
    await db
      .from('wallets')
      .where('business_id', business.id)
      .update({ balance_cache: (overrides.capital ?? 100_000_00n).toString() })

    const product = await FinancialProductService.create(
      business.id,
      {
        code: `LN${suffix}`,
        name: 'Credit commercant',
        kind: 'loan',
        currencyCode: 'USD',
        minAmount: overrides.minAmount === undefined ? null : overrides.minAmount,
        maxAmount: overrides.maxAmount === undefined ? null : overrides.maxAmount,
        interestRateBps: overrides.rateBps ?? 500,
        interestPeriod: 'month',
        interestMethod: overrides.method ?? 'flat',
        termMonthsMax: overrides.termMonths ?? 6,
        feeFlat: overrides.feeFlat === undefined ? null : overrides.feeFlat,
        feePercentBps: overrides.feePercentBps === undefined ? null : overrides.feePercentBps,
      },
      `ln-${suffix}`
    )
    await FinancialProductService.submit(product, `ln-${suffix}`)
    await FinancialProductService.approve(product, adminId, `ln-${suffix}`)

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

  function borrower(balance = 0n) {
    return createUserWithWallet({ email: `borrower-${randomUUID()}@test.com`, balance })
  }

  test('a flat loan writes the schedule it quoted', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, {
      method: 'flat',
      rateBps: 500,
      termMonths: 6,
    })
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    // 1000 at 5% a month flat over 6 months: 300 of interest, and it never falls.
    assert.equal(loan.principalOutstanding, 1_000_00n)
    assert.equal(loan.interestOutstanding, 300_00n)

    const lines = await LoanSchedule.query().where('loan_id', loan.id).orderBy('installment', 'asc')
    assert.lengthOf(lines, 6)
    assert.equal(lines[0].interest, 50_00n)
    assert.equal(lines[5].interest, 50_00n)
  })

  test('a declining loan costs the borrower less at the same rate', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, {
      method: 'declining',
      rateBps: 500,
      termMonths: 6,
    })
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    assert.equal(loan.interestOutstanding, 175_00n, 'against 300.00 flat')
  })

  test('the money leaves the lender and reaches the borrower', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix, { capital: 5_000_00n })
    const { user, wallet } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 1_000_00n)

    const lenderWallet = await Wallet.query().where('business_id', business.id).firstOrFail()
    assert.equal(lenderWallet.balanceCache, 4_000_00n)
    assert.isNotNull(loan.disbursementTransactionId)
  })

  test('the arrangement fee comes off what the borrower receives', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product, officer } = await lender(suffix, {
      feeFlat: 5_00n,
      feePercentBps: 100,
      capital: 5_000_00n,
    })
    const { user, wallet } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    // 5.00 flat plus 1% of 1000.00 = 15.00 withheld.
    assert.equal(loan.feesCharged, 15_00n)
    await wallet.refresh()
    assert.equal(wallet.balanceCache, 985_00n)

    // The borrower still owes the full principal they were quoted, and the fee stayed with the
    // lender — TumaPlus takes nothing off a borrower's loan.
    assert.equal(loan.principalOutstanding, 1_000_00n)
    const lenderWallet = await Wallet.query().where('business_id', business.id).firstOrFail()
    assert.equal(lenderWallet.balanceCache, 4_015_00n)
  })

  test('paying every instalment leaves exactly nothing owed', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { method: 'declining', capital: 5_000_00n })
    const { user, wallet } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    // Fund the borrower so they can actually pay the interest too.
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 2_000_00n })

    const lines = await LoanSchedule.query().where('loan_id', loan.id).orderBy('installment', 'asc')
    for (const line of lines) {
      await LoanService.repay(loan, line.principal + line.interest, `ln-${suffix}`)
    }

    assert.equal(loan.principalOutstanding, 0n)
    assert.equal(loan.interestOutstanding, 0n)
    assert.equal(loan.status, 'repaid')
    assert.isNotNull(loan.closedAt)

    const settled = await LoanSchedule.query().where('loan_id', loan.id).whereNull('settled_at')
    assert.lengthOf(settled, 0, 'every line settled')
  })

  test('a payment takes interest before principal', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { method: 'flat', capital: 5_000_00n })
    const { user, wallet } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 2_000_00n })

    // First instalment is 166.67 principal + 50.00 interest. Paying 60.00 must clear the interest
    // first, leaving 10.00 against principal — not the other way round, which would leave the
    // borrower owing more than their schedule says.
    await LoanService.repay(loan, 60_00n, `ln-${suffix}`)

    const repayment = await db.from('loan_repayments').where('loan_id', loan.id).first()
    assert.equal(BigInt(repayment.applied_to_interest), 50_00n)
    assert.equal(BigInt(repayment.applied_to_principal), 10_00n)
    assert.equal(loan.status, 'repaying')
  })

  test('an institution cannot lend money it does not have', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { capital: 100_00n })
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)

    await assert.rejects(
      () => LoanService.disburse(loan, `ln-${suffix}`),
      /does not have the funds/
    )
    await loan.refresh()
    assert.equal(loan.status, 'approved', 'still awaiting its money')
  })

  test('an unapproved loan cannot be paid out', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await lender(suffix)
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 500_00n, `ln-${suffix}`)
    await assert.rejects(() => LoanService.disburse(loan, `ln-${suffix}`), /cannot be disbursed/)
  })

  test('a refusal carries its reason and closes the file', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix)
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 500_00n, `ln-${suffix}`)
    await LoanService.reject(
      loan,
      officer,
      'Revenus insuffisants pour cette echeance.',
      `ln-${suffix}`
    )

    assert.equal(loan.status, 'rejected')
    assert.equal(loan.decisionNotes, 'Revenus insuffisants pour cette echeance.')
    assert.equal(loan.decidedByStaffId, officer.id)

    await assert.rejects(() => LoanService.approve(loan, officer, `ln-${suffix}`))
  })

  test('you cannot repay more than you owe', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { capital: 5_000_00n })
    const { user, wallet } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 100_00n, `ln-${suffix}`)
    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)
    await db.from('wallets').where('id', wallet.id).update({ balance_cache: 10_000_00n })

    await assert.rejects(
      () => LoanService.repay(loan, 1_000_00n, `ln-${suffix}`),
      /is still owed on this loan/
    )
  })

  test('the product bounds are enforced at application', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await lender(suffix, { minAmount: 50_00n, maxAmount: 500_00n })
    const { user } = await borrower()

    await assert.rejects(() => LoanService.request(user.id, product.id, 10_00n, `ln-${suffix}`))
    await assert.rejects(() => LoanService.request(user.id, product.id, 900_00n, `ln-${suffix}`))
    const ok = await LoanService.request(user.id, product.id, 200_00n, `ln-${suffix}`)
    assert.equal(ok.status, 'requested')
  })

  test('the agreed terms survive a repricing', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product, officer } = await lender(suffix, { rateBps: 500, capital: 5_000_00n })
    const { user } = await borrower()

    const loan = await LoanService.request(user.id, product.id, 1_000_00n, `ln-${suffix}`)
    await db.from('financial_products').where('id', product.id).update({ interest_rate_bps: 2500 })

    await LoanService.approve(loan, officer, `ln-${suffix}`)
    await LoanService.disburse(loan, `ln-${suffix}`)

    // Copied when they applied, not read at disbursement.
    assert.equal(loan.interestRateBps, 500)
    assert.equal(loan.interestOutstanding, 300_00n)
  })

  test('a savings product cannot be borrowed against', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business } = await lender(suffix)
    const { user } = await borrower()

    const savings = await FinancialProductService.create(
      business.id,
      {
        code: `SAVX${suffix}`,
        name: 'Epargne',
        kind: 'savings',
        currencyCode: 'USD',
        interestRateBps: 300,
        interestPeriod: 'year',
      },
      `ln-${suffix}`
    )
    await FinancialProductService.submit(savings, `ln-${suffix}`)
    await FinancialProductService.approve(savings, adminId, `ln-${suffix}`)

    await assert.rejects(
      () => LoanService.request(user.id, savings.id, 100_00n, `ln-${suffix}`),
      /not a credit product/
    )
  })
})
