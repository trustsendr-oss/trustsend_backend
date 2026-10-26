import { DateTime } from 'luxon'
import { BaseModel, column, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import { Realtime } from '#services/realtime/realtime'

/** Rows whose status changed in the save under way (see the hooks below). */
const statusChanged = new WeakSet<object>()

export default class Dispute extends BaseModel {
  static table = 'disputes'

  @column({ isPrimary: true })
  declare id: string // Alphanumérique: DSP-XXXXXXXX

  @column()
  declare ledgerTransactionId: string // FK to ledger_transactions.id (TXN-XXXXXXXX)

  @column()
  declare raisedByType: 'user' | 'agent' | 'internal_user'

  @column()
  declare raisedById: number

  @column()
  declare reason: string

  @column()
  declare status:
    | 'opened'
    | 'investigating'
    | 'approved'
    | 'rejected'
    | 'resolved'
    /** Le client a renoncé — distinct de `resolved`, qui est une décision du support. */
    | 'withdrawn'

  @column()
  declare assignedTo: number | null

  @column()
  declare resolutionTransactionId: string | null

  @column()
  declare resolutionNotes: string | null

  @column.dateTime()
  declare openedAt: DateTime

  @column.dateTime()
  declare resolvedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /*
   * Realtime: the owner hears about a status change once it commits, whichever code path made it
   * (agent, support, scheduled job, provider callback). See app/services/realtime/realtime.ts.
   */
  @beforeSave()
  static noteStatusChange(row: Dispute) {
    if (row.$isNew || 'status' in row.$dirty) statusChanged.add(row)
  }

  @afterSave()
  static announceStatusChange(row: Dispute) {
    if (!statusChanged.delete(row)) return
    Realtime.toUserForRow(row, row.raisedByType === 'user' ? row.raisedById : null, {
      type: 'dispute.updated',
      id: row.id,
    })
  }
}
