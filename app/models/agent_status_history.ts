import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import Agent from '#models/agent'
import InternalUser from '#models/internal_user'

export default class AgentStatusHistory extends BaseModel {
  static table = 'agent_status_history'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentId: number

  @column()
  declare previousStatus: 'pending_approval' | 'active' | 'suspended' | 'terminated'

  @column()
  declare newStatus: 'pending_approval' | 'active' | 'suspended' | 'terminated'

  @column()
  declare changedBy: 'system' | 'internal_user'

  @column()
  declare changedById: number | null

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  // Relations
  @belongsTo(() => Agent, { foreignKey: 'agentId' })
  declare agent: BelongsTo<typeof Agent>

  @belongsTo(() => InternalUser, { foreignKey: 'changedById' })
  declare changedByUser: BelongsTo<typeof InternalUser>
}
