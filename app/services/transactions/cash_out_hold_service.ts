import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'

/**
 * How long a cash-out reservation holds the customer's funds before it lapses.
 *
 * A withdrawal is reserved from the customer's phone and paid out at the agent's counter: long
 * enough to walk there and queue, short enough that an abandoned request does not freeze money
 * for days. Past this, the reservation no longer counts against the balance — even before
 * `commands/expire_cash_outs.ts` flips its status — and the agent can no longer confirm it.
 */
export const CASH_OUT_RESERVATION_TTL_MINUTES = 30

/** Raised when funds exist on the wallet but are held by pending cash-out reservations. */
export class FundsReservedException extends Error {
  constructor(
    public walletId: number,
    public requested: bigint,
    public available: bigint
  ) {
    super(
      'Insufficient available balance: part of this balance is reserved for a pending cash withdrawal'
    )
    this.name = 'FundsReservedException'
  }
}

/**
 * Funds held by cash-out reservations.
 *
 * `initiate()` reserves a withdrawal without debiting anything — the debit only happens when the
 * agent confirms the payout. Checking new spending against the raw `balance_cache` therefore let a
 * customer reserve the same money twice, or spend it by transfer while the agent was counting the
 * notes, and the confirmation then failed after the cash had left the drawer. Every debit a
 * customer can trigger must compare against `availableBalance()` instead.
 *
 * Callers must hold the wallet row lock (`forUpdate`) on the same `trx`: that lock is what
 * serialises two concurrent reservations on one wallet, since both read the holds under it.
 */
export class CashOutHoldService {
  /** Oldest creation time a reservation can have and still hold funds. */
  static cutoff(): DateTime {
    return DateTime.now().minus({ minutes: CASH_OUT_RESERVATION_TTL_MINUTES })
  }

  static isExpired(createdAt: DateTime): boolean {
    return createdAt < this.cutoff()
  }

  /** Sum of live cash-out reservations (amount + fee) on a wallet, optionally leaving one out. */
  static async reservedFor(
    walletId: number,
    trx?: TransactionClientContract,
    excludeTransactionId?: string
  ): Promise<bigint> {
    const query = db
      .from('ledger_transactions')
      .where('type', 'cash_out')
      .where('status', 'reserved')
      .whereRaw(`metadata->>'user_wallet_id' = ?`, [String(walletId)])
      .where('created_at', '>=', this.cutoff().toJSDate())
      // The customer pays the agent's fee on top of the cash, so a reservation holds both.
      .select(db.raw('COALESCE(SUM(amount + COALESCE(fee, 0)), 0) AS total'))

    if (excludeTransactionId) query.whereNot('id', excludeTransactionId)
    if (trx) query.useTransaction(trx)

    const [row] = await query
    return BigInt(row?.total ?? 0)
  }

  /** Balance minus live reservations — what the customer may still spend or reserve. */
  static async availableBalance(
    wallet: { id: number; balanceCache?: bigint; balance_cache?: bigint | string },
    trx?: TransactionClientContract
  ): Promise<bigint> {
    // Lucid models expose `balanceCache`; raw db.query() rows expose `balance_cache`.
    const balance = BigInt(wallet.balanceCache ?? wallet.balance_cache ?? 0)
    return balance - (await this.reservedFor(wallet.id, trx))
  }

  /** @throws FundsReservedException when `amount` exceeds the available balance. */
  static async assertAvailable(
    wallet: { id: number; balanceCache?: bigint; balance_cache?: bigint | string },
    amount: bigint,
    trx?: TransactionClientContract
  ): Promise<void> {
    const available = await this.availableBalance(wallet, trx)
    if (available < amount) {
      throw new FundsReservedException(wallet.id, amount, available)
    }
  }
}
