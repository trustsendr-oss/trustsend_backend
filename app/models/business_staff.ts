import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
// Imported from the types entrypoint, which is where Lucid actually exports it. The other
// models in this directory take it from '@adonisjs/lucid/orm', where it no longer exists —
// see the typecheck output; that is a pre-existing breakage, not a convention worth copying.
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import User from '#models/user'
import Agent from '#models/agent'

export type BusinessStaffRole = 'teller' | 'credit_officer' | 'branch_manager' | 'admin'

/**
 * A person working for a partner institution — a teller, a credit officer, a branch manager.
 *
 * Distinct from the counter they operate (`agents`) so a cash discrepancy can be traced to whoever
 * was standing at the window, not merely to the window. They authenticate as an ordinary User, the
 * same way an agent does, and are resolved from that account by BusinessStaffIdentityService.
 */
export default class BusinessStaff extends BaseModel {
  static table = 'business_staff'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare businessId: number

  @column()
  declare userId: number

  /** Counter they are posted to; null for roles that are not tied to one. */
  @column()
  declare agentId: number | null

  @column()
  declare role: BusinessStaffRole

  @column()
  declare status: 'active' | 'suspended' | 'terminated'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Business, { foreignKey: 'businessId' })
  declare business: BelongsTo<typeof Business>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Agent, { foreignKey: 'agentId' })
  declare agent: BelongsTo<typeof Agent>
}
