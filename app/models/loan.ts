import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import FinancialProduct from '#models/financial_product'
import LoanRepayment from '#models/loan_repayment'
import LoanRestructuring from '#models/loan_restructuring'
import LoanSchedule from '#models/loan_schedule'
import SavingsAccount from '#models/savings_account'
import BorrowerGroup from '#models/borrower_group'
import User from '#models/user'
import { Realtime } from '#services/realtime/realtime'

export type LoanStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'repaying'
  | 'repaid'
  | 'defaulted'
  | 'cancelled'

export type LoanStage =
  'requested' | 'under_review' | 'committee_approved' | 'rejected' | 'disbursed' | 'closed'

export type CollateralStatus = 'none' | 'locked' | 'released' | 'seized'

/**
 * A loan made by a partner institution to a TumaPlus account holder.
 */
/** Rows whose status changed in the save under way (see the hooks below). */
const statusChanged = new WeakSet<object>()

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

  @column()
  declare groupId: number | null

  /** The credit officer assigned to follow this borrower/loan. */
  @column()
  declare assignedLoanOfficerId: number | null

  /** The credit officer or manager who took the decision. */
  @column()
  declare decidedByStaffId: number | null

  @column()
  declare currencyCode: string

  @column()
  declare principal: bigint

  @column()
  declare approvedPrincipal: bigint | null

  @column()
  declare principalOutstanding: bigint

  @column()
  declare interestOutstanding: bigint

  @column()
  declare feesCharged: bigint

  /** Compulsory cash collateral held for this loan */
  @column()
  declare mandatorySavingsLocked: bigint

  @column()
  declare collateralSavingsAccountId: number | null

  @column()
  declare collateralStatus: CollateralStatus

  /** Workflow stage */
  @column()
  declare stage: LoanStage

  /** Kept apart from interest so a borrower can see why they owe what they owe. */
  @column()
  declare penaltiesOutstanding: bigint

  /** Copied at disbursement, like every other term. */
  @column()
  declare penaltyRateBps: number | null

  @column()
  declare penaltyBasis: 'overdue_amount' | 'outstanding_principal' | null

  @column()
  declare penaltyGraceDays: number

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

  @column.dateTime()
  declare committeeDecisionAt: DateTime | null

  @column()
  declare committeeNotes: string | null

  @column()
  declare decisionNotes: string | null

  @column.dateTime()
  declare disbursedAt: DateTime | null

  @column.dateTime()
  declare closedAt: DateTime | null

  @column()
  declare disbursementTransactionId: string | null

  @column()
  declare isRestructured: boolean

  @column.dateTime()
  declare restructuredAt: DateTime | null

  @column()
  declare restructureCount: number

  @column.dateTime()
  declare defaultedAt: DateTime | null

  @column()
  declare defaultReason: string | null

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

  @belongsTo(() => BorrowerGroup, { foreignKey: 'groupId' })
  declare group: BelongsTo<typeof BorrowerGroup>

  @belongsTo(() => BusinessStaff, { foreignKey: 'assignedLoanOfficerId' })
  declare assignedLoanOfficer: BelongsTo<typeof BusinessStaff>

  @belongsTo(() => BusinessStaff, { foreignKey: 'decidedByStaffId' })
  declare decidedBy: BelongsTo<typeof BusinessStaff>

  @belongsTo(() => SavingsAccount, { foreignKey: 'collateralSavingsAccountId' })
  declare collateralSavingsAccount: BelongsTo<typeof SavingsAccount>

  @hasMany(() => LoanSchedule, { foreignKey: 'loanId' })
  declare schedule: HasMany<typeof LoanSchedule>

  @hasMany(() => LoanRepayment, { foreignKey: 'loanId' })
  declare repayments: HasMany<typeof LoanRepayment>

  @hasMany(() => LoanRestructuring, { foreignKey: 'loanId' })
  declare restructurings: HasMany<typeof LoanRestructuring>

  /** Everything still owed: principal, interest and anything charged for being late. */
  get totalOutstanding(): bigint {
    return this.principalOutstanding + this.interestOutstanding + this.penaltiesOutstanding
  }

  get isOutstanding(): boolean {
    return this.status === 'disbursed' || this.status === 'repaying' || this.status === 'defaulted'
  }

  /*
   * Realtime: the owner hears about a status change once it commits, whichever code path made it
   * (agent, support, scheduled job, provider callback). See app/services/realtime/realtime.ts.
   */
  @beforeSave()
  static noteStatusChange(row: Loan) {
    if (row.$isNew || 'status' in row.$dirty) statusChanged.add(row)
  }

  @afterSave()
  static announceStatusChange(row: Loan) {
    if (!statusChanged.delete(row)) return
    Realtime.toUserForRow(row, row.userId, { type: 'loan.updated', id: row.id, status: row.status })
  }
}
