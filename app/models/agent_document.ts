import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import Agent from '#models/agent'
import InternalUser from '#models/internal_user'

export default class AgentDocument extends BaseModel {
  static table = 'agent_documents'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentId: number

  @column()
  declare documentType: 'national_id' | 'business_registration' | 'tax_certificate' | 'bank_statement' | 'proof_of_address'

  @column()
  declare fileRef: string

  @column()
  declare status: 'pending' | 'verified' | 'rejected'

  @column()
  declare reviewedBy: number | null

  @column.dateTime()
  declare reviewedAt: DateTime | null

  @column()
  declare rejectionReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Agent, { foreignKey: 'agentId' })
  declare agent: BelongsTo<typeof Agent>

  @belongsTo(() => InternalUser, { foreignKey: 'reviewedBy' })
  declare reviewer: BelongsTo<typeof InternalUser>
}
