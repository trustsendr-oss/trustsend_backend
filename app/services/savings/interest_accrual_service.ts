import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import InterestAccrual from '#models/interest_accrual'
import SavingsAccount from '#models/savings_account'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { Money } from '#services/money/money'

export interface AccrualOutcome {
  accountsConsidered: number
  accountsPaid: number
  accountsSkipped: number
  totalPaid: bigint
  failures: Array<{ savingsAccountId: number; reason: string }>
}

/**
 * Paying savers the interest they were promised.
 *
 * ## Re-running is safe, by construction
 *
 * A row in `interest_accruals` keyed on (account, period) is inserted in the same transaction as
 * the posting. A retry, a duplicated cron or an operator re-running last night's job hits the
 * unique index and pays nothing a second time. This matters more than the arithmetic: getting a
 * figure slightly wrong is a correction, paying everybody twice is an incident.
 *
 * ## Which balance earns
 *
 * The LOWEST balance the account held during the period, not the balance on the day the job runs.
 * Paying on the closing balance would let anyone deposit the evening before accrual, collect a
 * month's interest and withdraw the next morning — the institution would be funding a trick rather
 * than savings. The minimum is read from the escrow wallet's own ledger entries, whose
 * `balance_after` snapshots exist precisely so a balance can be reconstructed at any past moment.
 *
 * ## Where the money comes from
 *
 * The institution's wallet. It is the institution that promised the rate and earns on the
 * deposits; TumaPlus holds the money but owes nothing on it. An institution that cannot pay is
 * reported rather than silently skipped — a rate nobody can honour is something its supervisor
 * needs to see.
 *
 * ## The rate
 *
 * The one recorded on the ACCOUNT, agreed when it was opened, never the product's rate today.
 */
export class InterestAccrualService {
  /** "2026-09" — the period a given moment belongs to. */
  static periodKeyFor(moment: DateTime): string {
    return moment.toFormat('yyyy-MM')
  }

  /**
   * Settles one period for every eligible account. Failures are collected rather than thrown: one
   * institution short of funds must not stop every other saver from being paid.
   */
  static async runForPeriod(period: DateTime, correlationId: string): Promise<AccrualOutcome> {
    const periodKey = this.periodKeyFor(period)
    const start = period.startOf('month')
    const end = period.endOf('month')

    const accounts = await SavingsAccount.query()
      .whereIn('status', ['active', 'matured'])
      .where('opened_at', '<=', end.toSQL()!)

    const outcome: AccrualOutcome = {
      accountsConsidered: accounts.length,
      accountsPaid: 0,
      accountsSkipped: 0,
      totalPaid: 0n,
      failures: [],
    }

    for (const account of accounts) {
      try {
        const paid = await this.accrueOne(account, periodKey, start, end, correlationId)
        if (paid > 0n) {
          outcome.accountsPaid += 1
          outcome.totalPaid += paid
        } else {
          outcome.accountsSkipped += 1
        }
      } catch (error) {
        outcome.failures.push({
          savingsAccountId: account.id,
          reason: (error as Error).message,
        })
      }
    }

    return outcome
  }

  /**
   * One account, one period. Returns what was paid, or zero when there was nothing to pay or the
   * period had already been settled.
   */
  static async accrueOne(
    account: SavingsAccount,
    periodKey: string,
    start: DateTime,
    end: DateTime,
    correlationId: string
  ): Promise<bigint> {
    const already = await InterestAccrual.query()
      .where('savings_account_id', account.id)
      .where('period_key', periodKey)
      .first()
    if (already) return 0n

    const escrow = await Wallet.findOrFail(account.walletId)
    const balance = await this.minimumBalance(escrow, start, end)
    if (balance <= 0n) {
      // Still recorded, so the period is closed and a later re-run does not reconsider it.
      await this.record(account, periodKey, balance, 0n, null, end)
      return 0n
    }

    const monthsPerPeriod = account.interestPeriod === 'year' ? 12n : 1n
    const denominator = 10_000n * monthsPerPeriod
    const amount = (balance * BigInt(account.interestRateBps) + denominator / 2n) / denominator

    if (amount === 0n) {
      await this.record(account, periodKey, balance, 0n, null, end)
      return 0n
    }

    return db.transaction(async (trx) => {
      const lenderWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('business_id', account.providerId)
        .where('currency_code', account.currencyCode)
        .where('status', 'active')
        .first()

      if (!lenderWallet) {
        throw new Error(`The institution has no active ${account.currencyCode} wallet`)
      }
      if (lenderWallet.balanceCache < amount) {
        // Reported, not swallowed: a rate an institution cannot honour is something its
        // supervisor needs to see rather than a line that quietly never ran.
        throw new Error(
          `The institution cannot cover ${amount} of interest on account ${account.id}`
        )
      }

      const providerAccount = await this.ledgerAccountFor(lenderWallet.id, 'business_wallet', trx)
      const escrowAccount = await this.ledgerAccountFor(escrow.id, 'user_wallet', trx)
      const money = new Money(amount, account.currencyCode)

      const posted = await LedgerService.postTransaction(
        'savings_interest',
        [
          { accountId: providerAccount, direction: 'debit', amount: money },
          { accountId: escrowAccount, direction: 'credit', amount: money },
        ],
        'system',
        0,
        {
          correlationId,
          description: `Interest for ${periodKey} on savings account ${account.id}`,
          metadata: {
            savings_account_id: account.id,
            period_key: periodKey,
            balance_used: balance.toString(),
            rate_bps: account.interestRateBps,
          },
          amount: money,
          trx,
        }
      )

      // In the SAME transaction as the posting: if this insert loses a race, the posting rolls
      // back with it, which is the whole guarantee.
      await this.record(account, periodKey, balance, amount, posted.id, end, trx)

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'savings.interest_accrued',
        resourceType: 'savings_account',
        resourceId: account.id,
        before: undefined,
        after: {
          period_key: periodKey,
          balance_used: balance.toString(),
          amount: amount.toString(),
          transaction_id: posted.id,
        },
        correlationId,
        trx,
      })

      return amount
    })
  }

  /**
   * The lowest the escrow wallet fell during the period.
   *
   * Reconstructed from `ledger_entries.balance_after`, which LedgerService snapshots on every
   * entry for exactly this kind of question. An account untouched all month earns on the balance
   * it held throughout; an account opened mid-period earns on the lowest it held SINCE opening,
   * not on the zero it stood at a moment before its first deposit.
   */
  private static async minimumBalance(
    escrow: Wallet,
    start: DateTime,
    end: DateTime
  ): Promise<bigint> {
    const opening = await db
      .from('ledger_entries')
      .where('ledger_account_id', escrow.ledgerAccountId)
      .where('created_at', '<', start.toSQL()!)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .select('balance_after')
      .first()

    const during = await db
      .from('ledger_entries')
      .where('ledger_account_id', escrow.ledgerAccountId)
      .where('created_at', '>=', start.toSQL()!)
      .where('created_at', '<=', end.toSQL()!)
      .select('balance_after')

    // Only balances the account actually held count. Seeding this with zero would mean an account
    // opened mid-period started at nothing and therefore earned nothing, for ever — the opening
    // balance is a candidate only when the account existed before the period began.
    const candidates: bigint[] = []
    if (opening) candidates.push(BigInt(opening.balance_after))
    for (const entry of during) candidates.push(BigInt(entry.balance_after))

    // A wallet that has never moved is simply worth what it holds.
    if (candidates.length === 0) return escrow.balanceCache

    let minimum = candidates[0]
    for (const balance of candidates) {
      if (balance < minimum) minimum = balance
    }

    return minimum < 0n ? 0n : minimum
  }

  private static async record(
    account: SavingsAccount,
    periodKey: string,
    balance: bigint,
    amount: bigint,
    transactionId: string | null,
    accruedAt: DateTime,
    trx?: TransactionClientContract
  ): Promise<void> {
    const accrual = new InterestAccrual()
    accrual.savingsAccountId = account.id
    accrual.periodKey = periodKey
    accrual.balanceUsed = balance
    accrual.rateBps = account.interestRateBps
    accrual.amount = amount
    accrual.ledgerTransactionId = transactionId
    accrual.accruedAt = accruedAt

    if (trx) {
      await accrual.useTransaction(trx).save()
    } else {
      await accrual.save()
    }
  }

  private static async ledgerAccountFor(
    walletId: number,
    ownerType: 'user_wallet' | 'business_wallet',
    trx: TransactionClientContract
  ): Promise<number> {
    const row = await db
      .query()
      .from('ledger_accounts')
      .where('owner_type', ownerType)
      .where('owner_id', walletId)
      .select('id')
      .useTransaction(trx)
      .first()

    if (!row) throw new Error(`No ledger account backs wallet ${walletId}`)
    return row.id
  }
}
