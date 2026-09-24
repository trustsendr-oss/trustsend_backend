import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessStaff from '#models/business_staff'
import Loan from '#models/loan'

/**
 * Audit record of a loan restructuring event.
 */
export default class LoanRestructuring extends BaseModel {
  static table = 'loan_restructurings'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare loanId: number

  @column()
  declare decidedByStaffId: number

  @column()
  declare previousPrincipalOutstanding: bigint

  @column()
  declare previousInterestOutstanding: bigint

  @column()
  declare previousTermMonths: number

  @column()
  declare previousInterestRateBps: number

  @column()
  declare newPrincipalOutstanding: bigint

  @column()
  declare newTermMonths: number

  @column()
  declare newInterestRateBps: number

  @column()
  declare gracePeriodMonths: number

  @column()
  declare reason: string

  @column.dateTime()
  declare restructuredAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Loan, { foreignKey: 'loanId' })
  declare loan: BelongsTo<typeof Loan>

  @belongsTo(() => BusinessStaff, { foreignKey: 'decidedByStaffId' })
  declare staff: BelongsTo<typeof BusinessStaff>
}
