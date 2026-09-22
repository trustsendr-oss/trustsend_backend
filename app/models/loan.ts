import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import FinancialProduct from '#models/financial_product'
import LoanRepayment from '#models/loan_repayment'
import LoanSchedule from '#models/loan_schedule'
import User from '#models/user'

export type LoanStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'repaying'
  | 'repaid'
  | 'defaulted'
  | 'cancelled'

/**
 * A loan made by a partner institution to a TumaPlus account holder.
 *
 * What is owed lives here, not in the ledger: the ledger records the cash that moved, this records
 * the contract it moved under. The terms are the ones agreed at approval, copied from the product
 * so that repricing it never reaches a borrower who already signed.
 */
export default class Loan extends BaseModel {
  static table = 'loans'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare productId: number

  @column()
  declare providerId: number

  @column()
  declare userId: number

  /** The credit officer who decided. A decision belongs to someone. */
  @column()
  declare decidedByStaffId: number | null

  @column()
  declare currencyCode: string

  @column()
  declare principal: bigint

  @column()
  declare principalOutstanding: bigint

  @column()
  declare interestOutstanding: bigint

  @column()
  declare feesCharged: bigint

  @column()
  declare interestRateBps: number

  @column()
  declare interestPeriod: 'month' | 'year'

  @column()
  declare interestMethod: 'flat' | 'declining'

  @column()
  declare termMonths: number

  @column()
  declare status: LoanStatus

  @column.dateTime()
  declare requestedAt: DateTime

  @column.dateTime()
  declare decidedAt: DateTime | null

  @column()
  declare decisionNotes: string | null

  @column.dateTime()
  declare disbursedAt: DateTime | null

  @column.dateTime()
  declare closedAt: DateTime | null

  @column()
  declare disbursementTransactionId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => FinancialProduct, { foreignKey: 'productId' })
  declare product: BelongsTo<typeof FinancialProduct>

  @belongsTo(() => Business, { foreignKey: 'providerId' })
  declare provider: BelongsTo<typeof Business>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare borrower: BelongsTo<typeof User>

  @belongsTo(() => BusinessStaff, { foreignKey: 'decidedByStaffId' })
  declare decidedBy: BelongsTo<typeof BusinessStaff>

  @hasMany(() => LoanSchedule, { foreignKey: 'loanId' })
  declare schedule: HasMany<typeof LoanSchedule>

  @hasMany(() => LoanRepayment, { foreignKey: 'loanId' })
  declare repayments: HasMany<typeof LoanRepayment>

  /** Everything still owed, interest included. */
  get totalOutstanding(): bigint {
    return this.principalOutstanding + this.interestOutstanding
  }

  get isOutstanding(): boolean {
    return this.status === 'disbursed' || this.status === 'repaying'
  }
}
