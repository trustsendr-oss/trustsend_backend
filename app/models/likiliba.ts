import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import LikilibaMember from '#models/likiliba_member'
import LikilibaRound from '#models/likiliba_round'
import LikilibaRuleVersion from '#models/likiliba_rule_version'
import type { LikilibaCurrency } from '#config/likiliba'

export type LikilibaStatus =
  'recruiting' | 'locked' | 'active' | 'suspended' | 'completed' | 'cancelled'
export type LikilibaFrequency = 'weekly' | 'biweekly' | 'monthly'
export type LikilibaPenaltyMode = 'none' | 'fixed' | 'percent'
export type LikilibaOrderingMode = 'draw' | 'manual'

/**
 * A private rotating savings group. Its money sits in the pot wallet (`potWalletId`); this row
 * only carries the rules and the state of the cycle.
 */
export default class Likiliba extends BaseModel {
  static table = 'likilibas'

  @column({ isPrimary: true })
  declare id: number

  /** Public reference shown to members: LKB-XXXXXXXX. */
  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare currencyCode: LikilibaCurrency

  /** What each member pays each round, in minor units. */
  @column()
  declare contributionAmount: bigint

  @column()
  declare frequency: LikilibaFrequency

  /** Number of participants, organiser included — also the number of rounds. */
  @column()
  declare size: number

  /** Due date of the first round. */
  @column.dateTime()
  declare startsAt: DateTime

  @column()
  declare creatorUserId: number

  @column()
  declare cautionRequired: boolean

  @column()
  declare cautionMultiplier: number | null

  @column()
  declare graceHours: number

  @column()
  declare escalationDays: number

  @column()
  declare penaltyMode: LikilibaPenaltyMode

  @column()
  declare penaltyFixedAmount: bigint | null

  @column()
  declare penaltyDailyBps: number | null

  @column()
  declare penaltyCapBps: number

  @column()
  declare orderingMode: LikilibaOrderingMode

  /** SHA-256 of the draw seed, published when the group is locked. */
  @column()
  declare drawSeedHash: string | null

  /** Revealed when the cycle starts; never serialised before that. */
  @column({ serializeAs: null })
  declare drawSeed: string | null

  @column()
  declare potWalletId: number | null

  @column()
  declare status: LikilibaStatus

  @column()
  declare currentRuleVersionId: number | null

  @column()
  declare currentRoundNumber: number

  @column.dateTime()
  declare lockedAt: DateTime | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime()
  declare cancelledAt: DateTime | null

  @column()
  declare cancelReason: string | null

  @column.dateTime()
  declare suspendedAt: DateTime | null

  @column()
  declare suspensionReason: string | null

  /** Group photo set by the organiser, stored like profile photos; null shows the initials. */
  @column({ serializeAs: null })
  declare photoRef: string | null

  @column({ serializeAs: null })
  declare photoMimeType: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'creatorUserId' })
  declare creator: BelongsTo<typeof User>

  @hasMany(() => LikilibaMember, { foreignKey: 'likilibaId' })
  declare members: HasMany<typeof LikilibaMember>

  @hasMany(() => LikilibaRound, { foreignKey: 'likilibaId' })
  declare rounds: HasMany<typeof LikilibaRound>

  @belongsTo(() => LikilibaRuleVersion, { foreignKey: 'currentRuleVersionId' })
  declare currentRules: BelongsTo<typeof LikilibaRuleVersion>

  /**
   * (N − 1) × C: what one round pays out, before commission. The beneficiary does not pay into
   * their own round — their share is netted — so the pot collects from the other members only.
   */
  get roundAmount(): bigint {
    return this.contributionAmount * BigInt(this.size - 1)
  }

  /** What each member locks, when a caution is required. */
  get cautionAmount(): bigint {
    return this.cautionRequired ? this.contributionAmount * BigInt(this.cautionMultiplier ?? 0) : 0n
  }
}
