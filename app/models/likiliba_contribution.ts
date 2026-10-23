import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LikilibaMember from '#models/likiliba_member'
import LikilibaRound from '#models/likiliba_round'

/**
 * - pending: expected, not yet due or due and still payable without consequence;
 * - late: past its due date and unpaid;
 * - confirmed: paid into the pot by the member;
 * - covered: paid into the pot by cautions after the grace period — the member owes a debt;
 * - netted: the beneficiary's own share, withheld from their payout instead of being paid in;
 * - cancelled: the cycle was cancelled.
 */
export type LikilibaContributionStatus =
  'pending' | 'late' | 'confirmed' | 'covered' | 'netted' | 'cancelled'

export default class LikilibaContribution extends BaseModel {
  static table = 'likiliba_contributions'

  @column({ isPrimary: true })
  declare id: number

  /** Unique reference shown on receipts: LKC-XXXXXXXX. */
  @column()
  declare reference: string

  @column()
  declare likilibaId: number

  @column()
  declare roundId: number

  @column()
  declare memberId: number

  @column()
  declare amount: bigint

  @column()
  declare status: LikilibaContributionStatus

  @column()
  declare ledgerTransactionId: string | null

  @column()
  declare paidVia: 'manual' | 'auto_debit' | null

  @column()
  declare attempts: number

  @column.dateTime()
  declare lastAttemptAt: DateTime | null

  @column()
  declare lastFailureReason: string | null

  @column.dateTime()
  declare nextAttemptAt: DateTime | null

  @column.dateTime()
  declare remindedAt: DateTime | null

  @column.dateTime()
  declare dueNotifiedAt: DateTime | null

  @column.dateTime()
  declare lateNotifiedAt: DateTime | null

  @column.dateTime()
  declare confirmedAt: DateTime | null

  @column.dateTime()
  declare coveredAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LikilibaRound, { foreignKey: 'roundId' })
  declare round: BelongsTo<typeof LikilibaRound>

  @belongsTo(() => LikilibaMember, { foreignKey: 'memberId' })
  declare member: BelongsTo<typeof LikilibaMember>

  /** Money for this share is in the pot (or, netted, accounted for in the payout). */
  get isSettledInPot(): boolean {
    return this.status === 'confirmed' || this.status === 'covered' || this.status === 'netted'
  }
}
