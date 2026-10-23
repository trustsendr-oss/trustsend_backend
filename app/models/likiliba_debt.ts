import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * What a member owes inside the group.
 *
 * - caution_cover: a caution advanced the member's missing contribution; repaying it restores
 *   that caution (the creditor's collateral wallet);
 * - penalty: a penalty the member's balance could not pay; repaying it pays the round's
 *   beneficiary (the creditor's primary wallet).
 */
export default class LikilibaDebt extends BaseModel {
  static table = 'likiliba_debts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare debtorMemberId: number

  @column()
  declare creditorMemberId: number

  @column()
  declare origin: 'caution_cover' | 'penalty'

  @column()
  declare contributionId: number | null

  @column()
  declare penaltyId: number | null

  @column()
  declare amount: bigint

  @column()
  declare remaining: bigint

  @column()
  declare status: 'open' | 'settled' | 'written_off'

  @column.dateTime()
  declare settledAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
