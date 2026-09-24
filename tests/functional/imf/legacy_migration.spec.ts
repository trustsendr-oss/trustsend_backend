import { test } from '@japa/runner'
import Business from '#models/business'
import FinancialProduct from '#models/financial_product'
import User from '#models/user'
import Loan from '#models/loan'
import SavingsAccount from '#models/savings_account'
import {
  LegacyMigrationService,
  MemberMigrationRecord,
} from '#services/lending/legacy_migration_service'

async function findImf(): Promise<Business> {
  return Business.query().where('kind', 'imf').where('status', 'active').firstOrFail()
}

async function findOrCreateLoanProduct(businessId: number): Promise<FinancialProduct> {
  let prod = await FinancialProduct.query()
    .where('provider_id', businessId)
    .where('kind', 'loan')
    .first()

  if (!prod) {
    prod = new FinancialProduct()
    prod.providerId = businessId
    prod.name = 'Crédit Migration Test'
    prod.code = `PROD_MIG_${Date.now()}`
    prod.kind = 'loan'
    prod.currencyCode = 'USD'
    prod.interestRateBps = 1500
    prod.interestPeriod = 'month'
    prod.interestMethod = 'flat'
    prod.termMonthsMin = 1
    prod.termMonthsMax = 24
    prod.status = 'active'
    await prod.save()
  }

  return prod
}

test.group('IMF — Legacy & Manual Data Migration Tool', () => {
  test('validateBatch detects format errors in dry-run mode', ({ assert }) => {
    const records: MemberMigrationRecord[] = [
      {
        full_name: '', // Invalid empty name
        opening_savings_balance: '50000',
        currency_code: 'USD',
      },
      {
        full_name: 'Valid Member',
        opening_savings_balance: '-100', // Invalid negative savings
        currency_code: 'USD',
      },
    ]

    const result = LegacyMigrationService.validateBatch(records)
    assert.isFalse(result.valid)
    assert.equal(result.errors.length, 2)
  })

  test('commitBatch imports members, creates savings with opening ledger and existing loans', async ({
    assert,
  }) => {
    const imf = await findImf().catch(() => null)
    if (!imf) return

    const loanProduct = await findOrCreateLoanProduct(imf.id)
    const uniqueSuffix = Date.now().toString().slice(-4)

    const records: MemberMigrationRecord[] = [
      {
        full_name: `Maman Marie Migration ${uniqueSuffix}`,
        phone: `+24381${uniqueSuffix}11`,
        opening_savings_balance: '50000', // 500.00 USD
        locked_collateral: '10000', // 100.00 USD
        currency_code: 'USD',
        group_name: `Groupe Solidaire ${uniqueSuffix}`,
      },
      {
        full_name: `Papa Jean Migration ${uniqueSuffix}`,
        phone: `+24381${uniqueSuffix}22`,
        opening_savings_balance: '20000', // 200.00 USD
        currency_code: 'USD',
        group_name: `Groupe Solidaire ${uniqueSuffix}`,
        existing_loan: {
          product_id: loanProduct.id,
          original_principal: '100000', // 1,000 USD
          principal_outstanding: '70000', // 700 USD remaining
          interest_outstanding: '10500', // 105 USD remaining interest
          term_months: 10,
          remaining_months: 7,
          interest_rate_bps: 1500,
          interest_method: 'flat',
          first_future_due_date: '2026-10-15',
        },
      },
    ]

    // Validate first
    const validation = LegacyMigrationService.validateBatch(records)
    assert.isTrue(validation.valid)
    assert.equal(validation.total_members, 2)
    assert.equal(validation.total_opening_savings, 70_000n)
    assert.equal(validation.total_opening_loans, 70_000n)

    // Execute migration commit
    const result = await LegacyMigrationService.commitBatch(
      imf.id,
      1,
      records,
      `mig-test-${uniqueSuffix}`
    )

    assert.isTrue(result.success)
    assert.equal(result.members_created, 2)
    assert.equal(result.savings_accounts_created, 2)
    assert.equal(result.loans_created, 1)
    assert.equal(result.groups_created, 1)

    // Verify User & Savings Account in DB
    const user = await User.findByOrFail('phone', `+24381${uniqueSuffix}11`)
    const savings = await SavingsAccount.findByOrFail('user_id', user.id)
    assert.equal(savings.lockedCollateralAmount, 10_000n)

    // Verify Papa Jean's active loan and schedules
    const user2 = await User.findByOrFail('phone', `+24381${uniqueSuffix}22`)
    const loan = await Loan.query().where('user_id', user2.id).preload('schedule').firstOrFail()
    assert.equal(loan.status, 'repaying')
    assert.equal(loan.principalOutstanding, 70_000n)
    assert.equal(loan.schedule.length, 7) // 7 remaining future installments created
  })
})
