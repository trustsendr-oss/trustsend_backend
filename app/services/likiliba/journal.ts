import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaEvent from '#models/likiliba_event'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import type { LikilibaActor } from '#services/likiliba/shared'
import { LikilibaRealtime } from '#services/likiliba/likiliba_realtime'

/**
 * Records one action twice, in the same transaction as the action itself: in the group's own
 * history, which its members read, and in audit_logs, which compliance reads. Both rise or fall
 * with the operation they describe.
 */
export class LikilibaJournal {
  static async record(params: {
    likiliba: Likiliba
    actor: LikilibaActor
    eventType: string
    memberId?: number | null
    payload?: Record<string, any>
    before?: Record<string, any>
    correlationId: string
    trx: TransactionClientContract
  }): Promise<void> {
    const payload = params.payload ? serialisable(params.payload) : null

    const event = new LikilibaEvent()
    event.likilibaId = params.likiliba.id
    event.memberId = params.memberId ?? null
    event.actorType = params.actor.type
    event.actorId = params.actor.id
    event.eventType = params.eventType
    event.payload = payload
    event.correlationId = params.correlationId
    await event.useTransaction(params.trx).save()

    // Every recorded event shows in the group's feed: members see it live.
    await LikilibaRealtime.changed(params.likiliba.id, params.trx)

    await AuditLoggerService.record({
      actorType: params.actor.type,
      actorId: params.actor.id,
      action: `likiliba.${params.eventType}`,
      resourceType: 'likiliba',
      resourceId: params.likiliba.id,
      before: params.before ? serialisable(params.before) : undefined,
      after: { code: params.likiliba.code, member_id: params.memberId ?? null, ...(payload ?? {}) },
      correlationId: params.correlationId,
      trx: params.trx,
    })
  }
}

/** bigint does not survive JSON.stringify; amounts are stored as strings, like everywhere else. */
function serialisable(value: Record<string, any>): Record<string, any> {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}
