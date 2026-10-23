import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import OutboxEvent from '#models/outbox_event'
import type { ReceiptStatus } from '#services/notifications/email_layout'

export const LIKILIBA_NOTIFICATION_EVENT = 'likiliba.notification'

export type LikilibaEmail = {
  subject: string
  /** Data for the `likiliba_receipt` e-mail template. */
  title: string
  sentence: string
  caption: string
  amount: string
  direction?: 'in' | 'out'
  status?: ReceiptStatus
  rows: Array<[string, string | null | undefined]>
  reference: string
  notice?: { tone: 'success' | 'warning' | 'danger' | 'info'; text: string }
}

/**
 * Tells members what happened to their group.
 *
 * Nothing is sent from here: each notification is an outbox event written in the caller's
 * transaction, delivered by the outbox relay afterwards (in-app row and push for everyone it
 * names, plus an e-mail receipt when `email` is set — money movements only). A rolled-back action
 * therefore notifies nobody, and a crash after commit loses nothing.
 */
export class LikilibaNotifier {
  static async notify(
    likiliba: Likiliba,
    params: {
      userIds: number[]
      type: string
      title: string
      message: string
      data?: Record<string, any>
      email?: LikilibaEmail
      correlationId: string
    },
    trx: TransactionClientContract
  ): Promise<void> {
    const userIds = [...new Set(params.userIds)].filter((id) => id > 0)
    if (userIds.length === 0) return

    const event = new OutboxEvent()
    event.aggregateType = 'likiliba'
    event.aggregateId = likiliba.code
    event.eventType = LIKILIBA_NOTIFICATION_EVENT
    event.payload = {
      user_ids: userIds,
      type: `likiliba.${params.type}`,
      title: params.title,
      message: params.message,
      data: { likiliba_id: likiliba.id, likiliba_code: likiliba.code, ...(params.data ?? {}) },
      email: params.email ?? null,
      correlation_id: params.correlationId,
    }
    event.status = 'pending'
    await event.useTransaction(trx).save()
  }
}
