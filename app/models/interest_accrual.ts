import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import SavingsAccount from '#models/savings_account'

/**
 * Proof that a period's interest has been settled on an account.
 *
 * Its unique (account, period) index is what makes accrual safe to re-run: a retry or a duplicated
 * cron inserts nothing and pays nothing a second time.
 */
export default class InterestAccrual extends BaseModel {
  static table = 'interest_accruals'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare savingsAccountId: number

  /** The period the interest is FOR, e.g. "2026-09" — not when the job ran. */
  @column()
  declare periodKey: string

  @column()
  declare balanceUsed: bigint

  @column()
  declare rateBps: number

  @column()
  declare amount: bigint

  /** Null when the computed interest rounded to zero and nothing was posted. */
  @column()
  declare ledgerTransactionId: string | null

  @column.dateTime()
  declare accruedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => SavingsAccount, { foreignKey: 'savingsAccountId' })
  declare account: BelongsTo<typeof SavingsAccount>
}
