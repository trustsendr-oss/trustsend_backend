import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/orm'
import Wallet from '#models/wallet'
import AgentApplication from '#models/agent_application'
import AgentDocument from '#models/agent_document'
import AgentDevice from '#models/agent_device'
import InternalUser from '#models/internal_user'

export default class Agent extends BaseModel {
  static table = 'agents'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare code: string

  @column()
  declare fullName: string

  @column()
  declare email: string

  @column()
  declare phone: string

  @column()
  declare tier: 'agent' | 'super_agent' | 'distributor' | 'master'

  @column()
  declare parentAgentId: number | null

  @column()
  declare region: string | null

  @column()
  declare businessName: string | null

  @column()
  declare address: string | null

  @column()
  declare city: string | null

  @column()
  declare latitude: number | null

  @column()
  declare longitude: number | null

  @column()
  declare status: 'pending_approval' | 'active' | 'suspended' | 'terminated'

  @column()
  declare walletId: number | null

  @column()
  declare commissionRate: number

  /** Per-agent operational caps on cash volume — null means uncapped. See the migration's doc
   * comment for why these live here rather than on the agent's float wallet. */
  @column()
  declare dailyLimit: bigint | null

  @column()
  declare monthlyLimit: bigint | null

  @column()
  declare perTransactionLimit: bigint | null

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column()
  declare approvedBy: number | null

  @column.dateTime()
  declare suspendedAt: DateTime | null

  @column()
  declare suspensionReason: string | null

  @column.dateTime()
  declare terminatedAt: DateTime | null

  @column()
  declare terminationReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Wallet, { foreignKey: 'walletId' })
  declare wallet: BelongsTo<typeof Wallet>

  @belongsTo(() => InternalUser, { foreignKey: 'approvedBy' })
  declare approver: BelongsTo<typeof InternalUser>

  @hasMany(() => Agent, { foreignKey: 'parentAgentId' })
  declare childAgents: HasMany<typeof Agent>

  @hasMany(() => AgentApplication, { foreignKey: 'sponsorAgentId' })
  declare sponsoredApplications: HasMany<typeof AgentApplication>

  @hasMany(() => AgentDocument, { foreignKey: 'agentId' })
  declare documents: HasMany<typeof AgentDocument>

  @hasMany(() => AgentDevice, { foreignKey: 'agentId' })
  declare devices: HasMany<typeof AgentDevice>
}
