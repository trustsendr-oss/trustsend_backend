import transmit from '@adonisjs/transmit/services/main'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What the app is told, on its own channel `users/{id}`.
 *
 * Events only say *what changed*, never the data itself: the app refetches through the usual
 * REST routes, which keep their own access checks. A lost event is therefore harmless — the app
 * refetches everything when its connection comes back.
 */
export type RealtimeEvent =
  | { type: 'crypto_deposit.updated'; id: number; status: string }
  | { type: 'mobile_money_deposit.updated'; deposit_id: string; status: string }
  | { type: 'wallet.updated' }
  /** A cash withdrawal at an agent changed state; sent to the customer and to the agent. */
  | { type: 'cash_out.updated'; transaction_id: string; status: string }
  /** A mobile money payout (send to a number, withdrawal) settled. */
  | { type: 'mobile_money_payout.updated'; payout_id: string; status: string }
  /** A card changed outside the app: status set by the issuer, a refund… */
  | { type: 'card.updated'; card_id: number }
  /** A new in-app notification: the list and the badge refresh. */
  | { type: 'notification.created' }
  /** An international transfer changed state (held, paid, refunded, expired…). */
  | { type: 'remittance.updated'; id: string; status: string }
  /** A dispute changed: a new message in its thread, or its status. */
  | { type: 'dispute.updated'; id: string }
  /** The identity verification was decided (approved, rejected, expired…). */
  | { type: 'kyc.updated'; status: string }
  /** A savings account or a loan changed state at the institution. */
  | { type: 'savings.updated'; id: number; status: string }
  | { type: 'loan.updated'; id: number; status: string }
  /** The group's feed or state changed: a message, a reaction, a contribution, a payout… */
  | { type: 'likiliba.updated'; likiliba_id: number }

export function userChannel(userId: number) {
  return `users/${userId}`
}

export class Realtime {
  /** Sends right away. For changes already committed (or not in a transaction at all). */
  static toUser(userId: number | null | undefined, ...events: RealtimeEvent[]) {
    if (!userId) return
    for (const event of events) {
      try {
        transmit.broadcast(userChannel(userId), event)
      } catch (error) {
        // Never let a notification break the money movement that triggered it.
        logger.warn({ err: error, userId, type: event.type }, 'realtime broadcast failed')
      }
    }
  }

  /**
   * Sends once `trx` commits, and not at all if it rolls back: the app must never refetch before
   * the change is visible, nor hear about a change that did not happen.
   */
  /**
   * Every ledger posting ends here (LedgerService.postTransaction): the people whose wallets it
   * touched — their own wallets, or an agent's float for the agent's user — hear `wallet.updated`
   * once it commits. One choke point covers every way money moves: transfers, cash at an agent,
   * mobile money, cards, likiliba, fees, reversals.
   */
  static async walletsChanged(trx: TransactionClientContract, ledgerAccountIds: number[]) {
    if (ledgerAccountIds.length === 0) return
    const rows = await db
      .from('wallets')
      .useTransaction(trx)
      .leftJoin('agents', 'agents.id', 'wallets.agent_id')
      .whereIn('wallets.ledger_account_id', ledgerAccountIds)
      .select('wallets.user_id as user_id', 'agents.user_id as agent_user_id')
    const owners = new Set<number>()
    for (const row of rows) {
      if (row.user_id) owners.add(Number(row.user_id))
      if (row.agent_user_id) owners.add(Number(row.agent_user_id))
    }
    for (const userId of owners) Realtime.toUserAfterCommit(trx, userId, { type: 'wallet.updated' })
  }

  /**
   * For model hooks: after commit when the row is saved inside a transaction, right away
   * otherwise. Model hooks catch every code path that changes a row, whoever triggers it.
   */
  static toUserForRow(
    row: { $trx?: TransactionClientContract },
    userId: number | null | undefined,
    event: RealtimeEvent
  ) {
    if (row.$trx) Realtime.toUserAfterCommit(row.$trx, userId, event)
    else Realtime.toUser(userId, event)
  }

  static toUserAfterCommit(
    trx: TransactionClientContract,
    userId: number | null | undefined,
    ...events: RealtimeEvent[]
  ) {
    if (!userId) return
    trx.after('commit', () => Realtime.toUser(userId, ...events))
  }
}
