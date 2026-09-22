import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import FinancialProduct from '#models/financial_product'
import LedgerAccount from '#models/ledger_account'
import SavingsAccount from '#models/savings_account'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { Money } from '#services/money/money'

export class ProductNotAvailableException extends Error {
  constructor(reason: string) {
    super(`This savings product is not available: ${reason}`)
    this.name = 'ProductNotAvailableException'
  }
}

export class AmountOutOfRangeException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AmountOutOfRangeException'
  }
}

export class AccountNotWithdrawableException extends Error {
  constructor(maturesAt: DateTime | null) {
    super(
      maturesAt
        ? `These savings are locked until ${maturesAt.toISODate()}`
        : 'This account is closed'
    )
    this.name = 'AccountNotWithdrawableException'
  }
}

export class NoPrimaryWalletException extends Error {
  constructor(currencyCode: string) {
    super(`You have no active ${currencyCode} wallet to move money from`)
    this.name = 'NoPrimaryWalletException'
  }
}

/**
 * Money moving between someone's spendable wallet and their savings with an institution.
 *
 * Every movement is a double-entry transaction between two wallets the SAME person owns, which is
 * what makes this safe: the balance never leaves TumaPlus's custody, LedgerService row-locks both
 * sides, and the escrow wallet cannot go negative any more than the primary one can. The
 * institution earns on the balance and can see it; it never holds it.
 *
 * Nothing here accrues interest. A saver's rate is recorded on their account at opening and
 * applied by the scheduled job that comes with phase 5 — putting accrual in the deposit path would
 * make the amount credited depend on how often someone happened to pay in.
 */
export class SavingsService {
  /**
   * Opens an account and, optionally, funds it in the same breath.
   *
   * The escrow wallet is created here rather than reused: one wallet backs exactly one account, so
   * closing one can never empty another, and each account reconciles to a balance of its own.
   */
  static async open(
    userId: number,
    productId: number,
    options: { initialAmount?: bigint; correlationId: string }
  ): Promise<SavingsAccount> {
    const product = await FinancialProduct.query()
      .where('id', productId)
      .preload('provider')
      .first()

    if (!product) {
      throw new ProductNotAvailableException('no such product')
    }
    if (product.status !== 'active') {
      throw new ProductNotAvailableException('it is not published')
    }
    if (product.provider.status !== 'active') {
      // Yesterday's approval is not a licence to keep taking deposits today.
      throw new ProductNotAvailableException('the institution is not active')
    }
    if (product.kind !== 'savings' && product.kind !== 'term_deposit') {
      throw new ProductNotAvailableException('it is not a savings product')
    }

    const initial = options.initialAmount ?? 0n
    if (initial > 0n) {
      this.assertWithinRange(product, initial)
    } else if (product.minAmount && product.minAmount > 0n) {
      throw new AmountOutOfRangeException(
        `This product requires an opening deposit of at least ${product.minAmount}`
      )
    }

    const account = await db.transaction(async (trx) => {
      const wallet = await this.createEscrowWallet(userId, product, trx)

      const created = new SavingsAccount()
      created.productId = product.id
      created.providerId = product.providerId
      created.userId = userId
      created.walletId = wallet.id
      created.currencyCode = product.currencyCode
      created.status = 'active'
      created.openedAt = DateTime.now()
      created.maturesAt =
        product.kind === 'term_deposit' && product.termMonthsMin
          ? DateTime.now().plus({ months: product.termMonthsMin })
          : null
      // Copied, not referenced: repricing the product must not reach this saver.
      created.interestRateBps = product.interestRateBps
      created.interestPeriod = product.interestPeriod
      await created.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: userId,
        action: 'savings.opened',
        resourceType: 'savings_account',
        resourceId: created.id,
        before: undefined,
        after: {
          product_id: product.id,
          provider_id: product.providerId,
          rate_bps: created.interestRateBps,
          matures_at: created.maturesAt?.toISO() ?? null,
        },
        correlationId: options.correlationId,
        trx,
      })

      return created
    })

    if (initial > 0n) {
      await this.deposit(account, initial, options.correlationId)
    }

    return account
  }

  /** Moves money from the saver's spendable wallet into their savings. */
  static async deposit(
    account: SavingsAccount,
    amount: bigint,
    correlationId: string
  ): Promise<SavingsAccount> {
    if (account.status === 'closed') {
      throw new AccountNotWithdrawableException(null)
    }

    const product = await FinancialProduct.findOrFail(account.productId)
    this.assertWithinRange(product, amount, await this.balanceOf(account))

    await this.move(account, amount, 'in', correlationId)
    return account
  }

  /**
   * Moves money back out to the saver's spendable wallet.
   *
   * A term deposit is refused before its date: that lock is precisely what the institution is
   * paying the higher rate for, so honouring it is not an inconvenience but the product.
   */
  static async withdraw(
    account: SavingsAccount,
    amount: bigint,
    correlationId: string
  ): Promise<SavingsAccount> {
    if (!account.isWithdrawable) {
      throw new AccountNotWithdrawableException(account.maturesAt)
    }

    await this.move(account, amount, 'out', correlationId)
    return account
  }

  /** Sweeps whatever is left back to the spendable wallet and closes the account. */
  static async close(account: SavingsAccount, correlationId: string): Promise<SavingsAccount> {
    if (account.status === 'closed') {
      return account
    }
    if (!account.isWithdrawable) {
      throw new AccountNotWithdrawableException(account.maturesAt)
    }

    const balance = await this.balanceOf(account)
    if (balance > 0n) {
      await this.move(account, balance, 'out', correlationId)
    }

    account.status = 'closed'
    account.closedAt = DateTime.now()
    await account.save()

    // The escrow wallet is closed with it: an empty wallet nobody can pay into is less confusing
    // than one that looks usable.
    await Wallet.query().where('id', account.walletId).update({ status: 'closed' })

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: account.userId,
      action: 'savings.closed',
      resourceType: 'savings_account',
      resourceId: account.id,
      before: { status: 'active' },
      after: { status: account.status, swept: balance.toString() },
      correlationId,
    })

    return account
  }

  static async balanceOf(account: SavingsAccount): Promise<bigint> {
    const wallet = await Wallet.findOrFail(account.walletId)
    return wallet.balanceCache
  }

  /**
   * One movement, either direction, as a double-entry transaction between two wallets the same
   * person owns. LedgerService locks both and refuses to take either negative, so an overdraw is
   * rejected by the engine rather than by a check that could drift out of date here.
   */
  private static async move(
    account: SavingsAccount,
    amount: bigint,
    direction: 'in' | 'out',
    correlationId: string
  ): Promise<void> {
    if (amount <= 0n) {
      throw new AmountOutOfRangeException('The amount must be greater than zero')
    }

    await db.transaction(async (trx) => {
      const primary = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('user_id', account.userId)
        .where('currency_code', account.currencyCode)
        .where('status', 'active')
        .first()

      if (!primary) {
        throw new NoPrimaryWalletException(account.currencyCode)
      }

      const primaryAccount = await this.ledgerAccountFor(primary.id, trx)
      const escrowAccount = await this.ledgerAccountFor(account.walletId, trx)
      const money = new Money(amount, account.currencyCode)

      const entries =
        direction === 'in'
          ? [
              { accountId: primaryAccount, direction: 'debit' as const, amount: money },
              { accountId: escrowAccount, direction: 'credit' as const, amount: money },
            ]
          : [
              { accountId: escrowAccount, direction: 'debit' as const, amount: money },
              { accountId: primaryAccount, direction: 'credit' as const, amount: money },
            ]

      await LedgerService.postTransaction(
        direction === 'in' ? 'savings_deposit' : 'savings_withdrawal',
        entries,
        'user',
        account.userId,
        {
          correlationId,
          description:
            direction === 'in'
              ? `Deposit into savings account ${account.id}`
              : `Withdrawal from savings account ${account.id}`,
          metadata: {
            savings_account_id: account.id,
            provider_id: account.providerId,
            product_id: account.productId,
          },
          amount: money,
          trx,
        }
      )
    })
  }

  private static async ledgerAccountFor(
    walletId: number,
    trx: TransactionClientContract
  ): Promise<number> {
    const row = await db
      .query()
      .from('ledger_accounts')
      .where('owner_type', 'user_wallet')
      .where('owner_id', walletId)
      .select('id')
      .useTransaction(trx)
      .first()

    if (!row) {
      throw new Error(`No ledger account backs wallet ${walletId}`)
    }
    return row.id
  }

  /**
   * The code carries the institution so a per-institution deposit book can be produced later
   * without replaying history — the namespacing decision that costs nothing today and cannot be
   * retrofitted.
   */
  private static async createEscrowWallet(
    userId: number,
    product: FinancialProduct,
    trx: TransactionClientContract
  ): Promise<Wallet> {
    const ledgerAccount = new LedgerAccount()
    ledgerAccount.code = `SAVINGS.${product.provider.code}.${userId}.${product.currencyCode}.${Date.now()}`
    ledgerAccount.name = `${product.currencyCode} savings for user ${userId} with ${product.provider.name}`
    ledgerAccount.accountType = 'asset'
    ledgerAccount.ownerType = 'user_wallet'
    ledgerAccount.currencyCode = product.currencyCode
    ledgerAccount.status = 'active'
    await ledgerAccount.useTransaction(trx).save()

    const wallet = new Wallet()
    wallet.userId = userId
    wallet.ledgerAccountId = ledgerAccount.id
    wallet.currencyCode = product.currencyCode
    wallet.balanceCache = 0n
    // Not `primary`: the partial unique index keeps one spendable wallet per currency, and every
    // money path resolves that one. This balance is deliberately not spendable.
    wallet.purpose = 'savings'
    wallet.status = 'active'
    await wallet.useTransaction(trx).save()

    ledgerAccount.ownerId = wallet.id
    await ledgerAccount.useTransaction(trx).save()

    return wallet
  }

  private static assertWithinRange(
    product: FinancialProduct,
    amount: bigint,
    existingBalance = 0n
  ): void {
    if (product.minAmount && amount < product.minAmount && existingBalance === 0n) {
      throw new AmountOutOfRangeException(
        `The minimum for this product is ${product.minAmount} ${product.currencyCode}`
      )
    }
    if (product.maxAmount && existingBalance + amount > product.maxAmount) {
      throw new AmountOutOfRangeException(
        `This product caps a balance at ${product.maxAmount} ${product.currencyCode}`
      )
    }
  }
}
