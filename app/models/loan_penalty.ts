import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Loan from '#models/loan'

/**
 * One period's late charge on a loan.
 *
 * Its unique (loan, period) index is what makes the job safe to re-run: a cron that fires twice
 * charges nobody twice. `basisAmount` is kept because a borrower disputing a charge deserves to be
 * shown what it was calculated on, long after the balance it came from has changed.
 */
export default class LoanPenalty extends BaseModel {
  static table = 'loan_penalties'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare loanId: number

  /** The period charged for, e.g. "2026-09" — not when the job ran. */
  @column()
  declare periodKey: string

  @column()
  declare basisAmount: bigint

  @column()
  declare rateBps: number

  @column()
  declare daysOverdue: number

  @column()
  declare amount: bigint

  @column.dateTime()
  declare chargedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Loan, { foreignKey: 'loanId' })
  declare loan: BelongsTo<typeof Loan>
}
