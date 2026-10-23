import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Likiliba from '#models/likiliba'
import User from '#models/user'

export type LikilibaMemberStatus =
  'admitted' | 'committed' | 'active' | 'completed' | 'left' | 'removed'

/**
 * A participant. `admitted` by the organiser, `committed` once they signed the final rules with
 * their PIN (and locked their caution), `active` for the whole cycle.
 */
export default class LikilibaMember extends BaseModel {
  static table = 'likiliba_members'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare userId: number

  @column()
  declare role: 'organiser' | 'member'

  /** Rank in the rotation, 1-based; set when the cycle starts. */
  @column()
  declare position: number | null

  @column()
  declare status: LikilibaMemberStatus

  @column()
  declare invitationId: number | null

  /** The member's primary wallet in the group's currency: contributions leave it, payouts land in it. */
  @column()
  declare walletId: number

  @column()
  declare cautionWalletId: number | null

  @column()
  declare acceptedRuleVersionId: number | null

  @column.dateTime()
  declare rulesAcceptedAt: DateTime | null

  @column()
  declare autoDebit: boolean

  @column.dateTime()
  declare mandateGrantedAt: DateTime | null

  @column.dateTime()
  declare mandateRevokedAt: DateTime | null

  @column.dateTime()
  declare paidOutAt: DateTime | null

  @column.dateTime()
  declare leftAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Likiliba, { foreignKey: 'likilibaId' })
  declare likiliba: BelongsTo<typeof Likiliba>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  /** Still part of the group (as opposed to someone who left or was removed before the start). */
  get isInGroup(): boolean {
    return this.status !== 'left' && this.status !== 'removed'
  }
}
