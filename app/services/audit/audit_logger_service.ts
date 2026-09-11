import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AuditLog from '#models/audit_log'

/**
 * AuditLoggerService — Single point for recording all audit events
 *
 * Every action that could affect financial data, user access, or compliance
 * should be logged here. This is immutable and append-only.
 */
export class AuditLoggerService {
  static async record(data: {
    actorType: 'user' | 'agent' | 'internal_user' | 'system' | 'business'
    actorId: number
    action: string // Namespaced: agent.status.suspended, admin.wallet.balance.adjusted
    resourceType: string
    resourceId: number | string // numeric for int-keyed resources (agent, wallet, user, ...),
    // alphanumeric (TXN-/DSP-/KYC-XXXXXXXX) for resources migrated to string ids
    before?: Record<string, any>
    after?: Record<string, any>
    ipAddress?: string | null
    userAgent?: string | null
    deviceId?: string | null
    correlationId: string
    /**
     * Pass the SAME trx the caller is already inside of, when this is being recorded as part of
     * a larger db.transaction() (e.g. a money-moving operation). Without this, the audit row was
     * always written on its own separate connection/commit, independent of the surrounding
     * transaction — which meant either: (a) the surrounding transaction later rolling back left
     * a permanent audit entry describing a financial event that never actually took effect, or
     * (b) a transient failure in this INSERT alone could abort an otherwise-successful money
     * movement for a reason unrelated to the money movement itself. Joining the same trx makes
     * the audit entry rise or fall with the operation it documents.
     */
    trx?: TransactionClientContract
  }): Promise<AuditLog> {
    const auditLog = new AuditLog()
    auditLog.actorType = data.actorType
    auditLog.actorId = data.actorId
    auditLog.action = data.action
    auditLog.resourceType = data.resourceType
    auditLog.resourceId = String(data.resourceId)
    auditLog.before = data.before || null
    auditLog.after = data.after || null
    auditLog.ipAddress = data.ipAddress || null
    auditLog.userAgent = data.userAgent || null
    auditLog.deviceId = data.deviceId || null
    auditLog.correlationId = data.correlationId

    if (data.trx) {
      auditLog.useTransaction(data.trx)
    }
    await auditLog.save()
    return auditLog
  }
}
