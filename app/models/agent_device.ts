import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import Agent from '#models/agent'

export default class AgentDevice extends BaseModel {
  static table = 'agent_devices'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentId: number

  @column()
  declare deviceFingerprint: string

  @column()
  declare status: 'active' | 'revoked'

  @column.dateTime()
  declare registeredAt: DateTime

  @column.dateTime()
  declare lastUsedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Agent, { foreignKey: 'agentId' })
  declare agent: BelongsTo<typeof Agent>
}
