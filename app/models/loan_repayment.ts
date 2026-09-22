import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Loan from '#models/loan'

/**
 * One payment against a loan, and how it was split.
 *
 * The split is recorded rather than re-derived: interest-first is the rule today, and a schedule
 * re-read years later must show what actually happened, not what today's rule would have done.
 */
export default class LoanRepayment extends BaseModel {
  static table = 'loan_repayments'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare loanId: number

  @column()
  declare amount: bigint

  @column()
  declare appliedToInterest: bigint

  @column()
  declare appliedToPrincipal: bigint

  /** The cash movement behind it, so the book reconciles to the ledger. */
  @column()
  declare ledgerTransactionId: string

  @column.dateTime()
  declare paidAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Loan, { foreignKey: 'loanId' })
  declare loan: BelongsTo<typeof Loan>
}
