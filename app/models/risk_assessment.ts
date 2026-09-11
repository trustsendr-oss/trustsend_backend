import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import LedgerTransaction from '#models/ledger_transaction'

export default class RiskAssessment extends BaseModel {
  static table = 'risk_assessments'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ledgerTransactionId: number

  @column()
  declare score: number

  @column()
  declare riskLevel: 'low' | 'medium' | 'high' | 'critical'

  @column()
  declare rulesTriggered: any | null

  @column()
  declare provider: string | null

  @column()
  declare providerReference: string | null

  @column()
  declare decision: 'allow' | 'review' | 'block'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LedgerTransaction, { foreignKey: 'ledgerTransactionId' })
  declare transaction: BelongsTo<typeof LedgerTransaction>
}
