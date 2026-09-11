import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import User from '#models/user'
import Agent from '#models/agent'
import InternalUser from '#models/internal_user'

export default class AgentApplication extends BaseModel {
  static table = 'agent_applications'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare applicantUserId: number

  @column()
  declare tier: 'agent' | 'super_agent' | 'distributor' | 'master'

  @column()
  declare sponsorAgentId: number | null

  @column()
  declare status: 'submitted' | 'under_review' | 'approved' | 'rejected'

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
  @belongsTo(() => User, { foreignKey: 'applicantUserId' })
  declare applicant: BelongsTo<typeof User>

  @belongsTo(() => Agent, { foreignKey: 'sponsorAgentId' })
  declare sponsor: BelongsTo<typeof Agent>

  @belongsTo(() => InternalUser, { foreignKey: 'reviewedBy' })
  declare reviewer: BelongsTo<typeof InternalUser>
}
