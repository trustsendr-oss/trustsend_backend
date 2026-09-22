import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import InternalUser from '#models/internal_user'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { SavingsService } from '#services/savings/savings_service'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * Savings placed with a partner institution.
 *
 * The property worth defending is custody: the balance sits in an escrow wallet owned by the
 * SAVER, never in the institution's. An institution that failed would otherwise take those
 * deposits with it, carrying our name on the app the saver used. Several tests below assert the
 * ownership and the purpose of that wallet directly, because nothing else would notice if a future
 * change quietly credited the institution instead.
 *
 * Nothing is torn down — an append-only ledger forbids it once money has moved; see
 * counter_cash.spec.ts.
 */
test.group('Savings', (group) => {
  let adminId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `savings-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    adminId = admin.id
  })

  async function publishedProduct(
    suffix: string,
    overrides: Partial<{
      kind: 'savings' | 'term_deposit'
      minAmount: bigint | null
      maxAmount: bigint | null
      termMonthsMin: number | null
    }> = {}
  ) {
    const { business } = await BusinessOnboardingService.create({
      code: `TESTSAV${suffix}`,
      name: `Institution ${suffix}`,
      email: `sav${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `sav-${suffix}`,
      kind: 'imf',
    })
    business.status = 'active'
    await business.save()

    const product = await FinancialProductService.create(
      business.id,
      {
        code: `SAV${suffix}`,
        name: 'Epargne a vue',
        kind: overrides.kind ?? 'savings',
        currencyCode: 'USD',
        minAmount: overrides.minAmount === undefined ? null : overrides.minAmount,
        maxAmount: overrides.maxAmount === undefined ? null : overrides.maxAmount,
        interestRateBps: 300,
        interestPeriod: 'year',
        termMonthsMin: overrides.termMonthsMin ?? null,
      },
      `sav-${suffix}`
    )
    await FinancialProductService.submit(product, `sav-${suffix}`)
    await FinancialProductService.approve(product, adminId, `sav-${suffix}`)

    return { business, product }
  }

  function saver(balance = 1_000_00n) {
    return createUserWithWallet({ email: `saver-${randomUUID()}@test.com`, balance })
  }

  test('the balance sits in a wallet the saver owns, not the institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product } = await publishedProduct(suffix)
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 200_00n,
      correlationId: `sav-${suffix}`,
    })

    const escrow = await Wallet.findOrFail(account.walletId)
    assert.equal(escrow.userId, user.id, 'owned by the saver')
    assert.isNull(escrow.businessId, 'never by the institution')
    assert.equal(escrow.purpose, 'savings')
    assert.equal(escrow.balanceCache, 200_00n)
    assert.equal(account.providerId, business.id)
  })

  test('money moves out of the spendable wallet, and the books balance', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user, wallet } = await saver(500_00n)

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 120_00n,
      correlationId: `sav-${suffix}`,
    })

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 380_00n, 'debited from what they can spend')
    assert.equal(await SavingsService.balanceOf(account), 120_00n)

    const entries = await db
      .from('ledger_entries')
      .join('ledger_transactions', 'ledger_transactions.id', 'ledger_entries.ledger_transaction_id')
      .where('ledger_transactions.type', 'savings_deposit')
      .whereIn('ledger_entries.ledger_account_id', [wallet.ledgerAccountId, account.walletId])
      .count('* as total')
    assert.isAbove(Number(entries[0].total), 0)
  })

  test('the escrow balance is not spendable by the ordinary money paths', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user, wallet } = await saver(500_00n)

    await SavingsService.open(user.id, product.id, {
      initialAmount: 400_00n,
      correlationId: `sav-${suffix}`,
    })

    // Every money path resolves the wallet through the `primary` scope. It must still find the
    // spendable one and its reduced balance, never the savings.
    const resolved = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', user.id)
      .where('currency_code', 'USD')
      .where('status', 'active')
      .first()

    assert.equal(resolved!.id, wallet.id)
    assert.equal(resolved!.balanceCache, 100_00n)
  })

  test('you cannot save more than you have', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user } = await saver(50_00n)

    await assert.rejects(() =>
      SavingsService.open(user.id, product.id, {
        initialAmount: 200_00n,
        correlationId: `sav-${suffix}`,
      })
    )
  })

  test('a withdrawal returns the money to the spendable wallet', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user, wallet } = await saver(300_00n)

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 300_00n,
      correlationId: `sav-${suffix}`,
    })
    await SavingsService.withdraw(account, 100_00n, `sav-${suffix}`)

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 100_00n)
    assert.equal(await SavingsService.balanceOf(account), 200_00n)
  })

  test('you cannot withdraw more than the account holds', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user } = await saver(100_00n)

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 100_00n,
      correlationId: `sav-${suffix}`,
    })

    // Refused by LedgerService's negative-balance guard, not by a check here that could drift.
    await assert.rejects(() => SavingsService.withdraw(account, 200_00n, `sav-${suffix}`))
    assert.equal(await SavingsService.balanceOf(account), 100_00n)
  })

  test('a term deposit stays locked until its date', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix, {
      kind: 'term_deposit',
      termMonthsMin: 6,
    })
    const { user } = await saver(200_00n)

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 200_00n,
      correlationId: `sav-${suffix}`,
    })

    assert.isNotNull(account.maturesAt)
    assert.isFalse(account.isWithdrawable, 'the lock is what the higher rate pays for')
    await assert.rejects(
      () => SavingsService.withdraw(account, 10_00n, `sav-${suffix}`),
      /locked until/
    )

    // Once matured it opens, without anything else changing.
    account.maturesAt = DateTime.now().minus({ days: 1 })
    await account.save()
    await SavingsService.withdraw(account, 10_00n, `sav-${suffix}`)
    assert.equal(await SavingsService.balanceOf(account), 190_00n)
  })

  test('the agreed rate is frozen against a later repricing', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user } = await saver()

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 100_00n,
      correlationId: `sav-${suffix}`,
    })
    assert.equal(account.interestRateBps, 300)

    // The institution reprices. The saver keeps what they were promised.
    await db.from('financial_products').where('id', product.id).update({ interest_rate_bps: 50 })
    await account.refresh()
    assert.equal(account.interestRateBps, 300)
  })

  test('an unpublished product cannot be subscribed to', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user } = await saver()

    await db.from('financial_products').where('id', product.id).update({ status: 'draft' })

    await assert.rejects(
      () => SavingsService.open(user.id, product.id, { correlationId: `sav-${suffix}` }),
      /not available/
    )
  })

  test('a suspended institution stops taking deposits', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { business, product } = await publishedProduct(suffix)
    const { user } = await saver()

    await db.from('businesses').where('id', business.id).update({ status: 'suspended' })

    await assert.rejects(() =>
      SavingsService.open(user.id, product.id, { correlationId: `sav-${suffix}` })
    )
  })

  test('the product minimum is enforced', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix, { minAmount: 50_00n })
    const { user } = await saver()

    await assert.rejects(
      () =>
        SavingsService.open(user.id, product.id, {
          initialAmount: 10_00n,
          correlationId: `sav-${suffix}`,
        }),
      /minimum for this product/
    )
  })

  test('closing sweeps everything back and shuts the escrow wallet', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const { product } = await publishedProduct(suffix)
    const { user, wallet } = await saver(250_00n)

    const account = await SavingsService.open(user.id, product.id, {
      initialAmount: 250_00n,
      correlationId: `sav-${suffix}`,
    })
    await SavingsService.close(account, `sav-${suffix}`)

    await wallet.refresh()
    assert.equal(wallet.balanceCache, 250_00n, 'every cent came back')
    assert.equal(account.status, 'closed')

    const escrow = await Wallet.findOrFail(account.walletId)
    assert.equal(escrow.balanceCache, 0n)
    assert.equal(escrow.status, 'closed')
  })
})
