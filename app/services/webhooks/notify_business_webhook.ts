import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { WebhookService } from '#services/webhooks/webhook_service'
import type LedgerTransaction from '#models/ledger_transaction'

/**
 * If a transaction was initiated by a business with an active webhook subscription for this
 * event, queues a delivery (see webhook_deliveries — actually sent by the
 * `webhooks:deliver-pending` Ace command, not synchronously here). No-op for user-initiated
 * transactions. Never throws — a webhook wiring problem must not block the transaction itself.
 */
export async function notifyBusinessWebhook(
  txn: LedgerTransaction,
  eventType: string,
  trx?: TransactionClientContract
): Promise<void> {
  if (txn.initiatedByType !== 'business') {
    return
  }

  try {
    const subscriptions = await WebhookService.findActiveSubscriptions(
      'business',
      txn.initiatedById,
      eventType
    )

    for (const subscription of subscriptions) {
      const query = db.insertQuery().table('webhook_deliveries')
      if (trx) query.useTransaction(trx)
      await query.insert({
        subscription_id: subscription.id,
        event_type: eventType,
        payload: JSON.stringify({
          transaction_id: txn.id,
          type: txn.type,
          status: txn.status,
          metadata: txn.metadata,
        }),
        status: 'pending',
        retry_count: 0,
        next_retry_at: new Date(),
        created_at: new Date(),
      })
    }
  } catch (error) {
    // Best-effort — the ledger transaction this is attached to must still succeed. Logged
    // (not swallowed silently) so a real wiring bug here is still visible in production.
    console.error('notifyBusinessWebhook failed', { transactionId: txn.id, eventType, error })
  }
}
