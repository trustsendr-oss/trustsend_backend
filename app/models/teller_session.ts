import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Agent from '#models/agent'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import TellerSessionBalance from '#models/teller_session_balance'

export type TellerSessionStatus = 'open' | 'closed' | 'reconciled'

/**
 * A teller's shift at a counter.
 *
 * `open` means the drawer is taking cash; `closed` means it has been counted and is waiting for
 * someone else to sign it off; `reconciled` means they did. The second person is the control —
 * a teller signing off their own variance is not one.
 */
export default class TellerSession extends BaseModel {
  static table = 'teller_sessions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare businessId: number

  @column()
  declare agentId: number

  @column()
  declare staffId: number

  @column()
  declare status: TellerSessionStatus

  @column.dateTime()
  declare openedAt: DateTime

  @column.dateTime()
  declare closedAt: DateTime | null

  @column.dateTime()
  declare reconciledAt: DateTime | null

  @column()
  declare reconciledBy: number | null

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Business, { foreignKey: 'businessId' })
  declare business: BelongsTo<typeof Business>

  @belongsTo(() => Agent, { foreignKey: 'agentId' })
  declare counter: BelongsTo<typeof Agent>

  @belongsTo(() => BusinessStaff, { foreignKey: 'staffId' })
  declare teller: BelongsTo<typeof BusinessStaff>

  @belongsTo(() => BusinessStaff, { foreignKey: 'reconciledBy' })
  declare reconciler: BelongsTo<typeof BusinessStaff>

  @hasMany(() => TellerSessionBalance, { foreignKey: 'tellerSessionId' })
  declare balances: HasMany<typeof TellerSessionBalance>
}
