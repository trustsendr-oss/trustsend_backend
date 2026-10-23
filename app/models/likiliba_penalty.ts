import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaMember from '#models/likiliba_member'

/**
 * One day of lateness on one contribution. Paid to the beneficiary of the late round, never to
 * the platform. `in_debt` when the late member's balance could not cover it.
 */
export default class LikilibaPenalty extends BaseModel {
  static table = 'likiliba_penalties'

  @column({ isPrimary: true })
  declare id: number

  /** LKP-XXXXXXXX */
  @column()
  declare reference: string

  @column()
  declare likilibaId: number

  @column()
  declare contributionId: number

  @column()
  declare memberId: number

  @column()
  declare beneficiaryMemberId: number

  /** 1 for the first day after the grace period, and so on. */
  @column()
  declare dayNumber: number

  @column()
  declare amount: bigint

  @column()
  declare basis: 'fixed' | 'percent'

  @column()
  declare status: 'paid' | 'in_debt' | 'waived'

  @column()
  declare ledgerTransactionId: string | null

  @column.dateTime()
  declare assessedAt: DateTime

  @column.dateTime()
  declare settledAt: DateTime | null

  @column()
  declare waivedByInternalUserId: number | null

  @column()
  declare waiveReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LikilibaContribution, { foreignKey: 'contributionId' })
  declare contribution: BelongsTo<typeof LikilibaContribution>

  @belongsTo(() => LikilibaMember, { foreignKey: 'memberId' })
  declare member: BelongsTo<typeof LikilibaMember>

  @belongsTo(() => LikilibaMember, { foreignKey: 'beneficiaryMemberId' })
  declare beneficiary: BelongsTo<typeof LikilibaMember>
}
