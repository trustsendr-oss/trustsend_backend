import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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
}
