import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LikilibaMember from '#models/likiliba_member'
import { Realtime } from '#services/realtime/realtime'

/**
 * Tells every active member of a group that its feed or state changed.
 *
 * Sent on each member's own channel (`users/{id}`) rather than on a group channel: the app needs
 * no extra subscription, only members ever hear about the group, and it works unchanged across
 * several API instances. Groups are a few dozen people at most, so the fan-out is cheap.
 */
export class LikilibaRealtime {
  static async changed(likilibaId: number, trx?: TransactionClientContract) {
    const members = await LikilibaMember.query(trx ? { client: trx } : undefined)
      .where('likilibaId', likilibaId)
      .whereNotIn('status', ['left', 'removed'])
      .select('userId')

    const event = { type: 'likiliba.updated' as const, likiliba_id: likilibaId }
    for (const { userId } of members) {
      // In a transaction: only once it commits, so the app never refetches too early.
      if (trx) Realtime.toUserAfterCommit(trx, userId, event)
      else Realtime.toUser(userId, event)
    }
  }
}
