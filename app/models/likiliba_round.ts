import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Likiliba from '#models/likiliba'
import LikilibaMember from '#models/likiliba_member'
import LikilibaContribution from '#models/likiliba_contribution'

export type LikilibaRoundStatus =
  'scheduled' | 'collecting' | 'waiting_funds' | 'escalated' | 'paid_out' | 'cancelled'

/**
 * One turn of the rotation: every member contributes, one member — the beneficiary — receives.
 * Paid out only once the pot holds the full round amount: never partially.
 */
export default class LikilibaRound extends BaseModel {
  static table = 'likiliba_rounds'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare number: number

  @column()
  declare beneficiaryMemberId: number

  @column.dateTime()
  declare dueAt: DateTime

  @column.dateTime()
  declare graceEndsAt: DateTime

  @column()
  declare status: LikilibaRoundStatus

  @column.dateTime()
  declare openedAt: DateTime | null

  @column.dateTime()
  declare waitingSince: DateTime | null

  @column.dateTime()
  declare escalatedAt: DateTime | null

  @column()
  declare grossAmount: bigint | null

  @column()
  declare commissionAmount: bigint | null

  /** Taken from the payout to settle the beneficiary's own debts to the group. */
  @column()
  declare withheldAmount: bigint | null

  @column()
  declare netAmount: bigint | null

  @column()
  declare payoutTransactionId: string | null

  @column.dateTime()
  declare paidOutAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Likiliba, { foreignKey: 'likilibaId' })
  declare likiliba: BelongsTo<typeof Likiliba>

  @belongsTo(() => LikilibaMember, { foreignKey: 'beneficiaryMemberId' })
  declare beneficiary: BelongsTo<typeof LikilibaMember>

  @hasMany(() => LikilibaContribution, { foreignKey: 'roundId' })
  declare contributions: HasMany<typeof LikilibaContribution>
}
