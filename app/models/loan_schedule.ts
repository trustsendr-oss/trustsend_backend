import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Loan from '#models/loan'

/**
 * One instalment: what falls due, when, and how much of it has been met.
 *
 * `paid` accumulates because a line is often settled over several payments — a borrower short this
 * week pays what they have, and the rest lands against the same line later.
 */
export default class LoanSchedule extends BaseModel {
  static table = 'loan_schedules'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare loanId: number

  @column()
  declare installment: number

  @column.dateTime()
  declare dueAt: DateTime

  @column()
  declare principal: bigint

  @column()
  declare interest: bigint

  @column()
  declare paid: bigint

  @column.dateTime()
  declare settledAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Loan, { foreignKey: 'loanId' })
  declare loan: BelongsTo<typeof Loan>

  get total(): bigint {
    return this.principal + this.interest
  }

  get remaining(): bigint {
    const left = this.total - this.paid
    return left > 0n ? left : 0n
  }

  /** Past its date and not met. What PAR30 will count, once phase 5 arrives. */
  get isOverdue(): boolean {
    return this.remaining > 0n && this.dueAt < DateTime.now()
  }
}
