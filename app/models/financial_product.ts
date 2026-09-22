import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import InternalUser from '#models/internal_user'

export type FinancialProductKind = 'savings' | 'term_deposit' | 'loan'
export type FinancialProductStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'archived'

/**
 * A product a partner institution sells — a savings account, a term deposit, a loan.
 *
 * Amounts are in the smallest unit of `currencyCode`, as everywhere else in this codebase. Rates
 * are basis points (550 = 5.50%) rather than decimals: an interest rate is applied repeatedly
 * across a repayment schedule, and integer arithmetic keeps that exact — see the migration.
 *
 * Enforcement of what a product may charge, and of who may publish one, lives in
 * FinancialProductService; this model is just the row.
 */
export default class FinancialProduct extends BaseModel {
  static table = 'financial_products'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare providerId: number

  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare kind: FinancialProductKind

  @column()
  declare currencyCode: string

  @column()
  declare minAmount: bigint | null

  @column()
  declare maxAmount: bigint | null

  /** Basis points: 550 = 5.50%. Zero is a real rate, not a missing one. */
  @column()
  declare interestRateBps: number

  @column()
  declare interestPeriod: 'month' | 'year'

  /**
   * Loans only. `flat` charges the whole term's interest on the original principal, `declining`
   * only on what is still owed — at the same nominal rate the first costs the borrower markedly
   * more, and both are in everyday use, so it is the product that decides, never the platform.
   */
  @column()
  declare interestMethod: 'flat' | 'declining' | null

  @column()
  declare termMonthsMin: number | null

  @column()
  declare termMonthsMax: number | null

  @column()
  declare feeFlat: bigint | null

  @column()
  declare feePercentBps: number | null

  /** Share of a loan held back as compulsory savings before release, in basis points. */
  @column()
  declare mandatorySavingsBps: number | null

  /**
   * Basis points charged per period on a late loan; null means this product has no penalty. The
   * basis beside it is not optional decoration: the same rate on an overdue instalment and on the
   * whole outstanding principal differ by an order of magnitude.
   */
  @column()
  declare penaltyRateBps: number | null

  @column()
  declare penaltyBasis: 'overdue_amount' | 'outstanding_principal' | null

  /** Days late before anything is charged. Zero means a penalty from the first day. */
  @column()
  declare penaltyGraceDays: number

  @column()
  declare status: FinancialProductStatus

  @column.dateTime()
  declare submittedAt: DateTime | null

  @column.dateTime()
  declare reviewedAt: DateTime | null

  @column()
  declare reviewedBy: number | null

  /** Why it was rejected. Shown to the provider, so it has to read like an instruction. */
  @column()
  declare reviewNotes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Business, { foreignKey: 'providerId' })
  declare provider: BelongsTo<typeof Business>

  @belongsTo(() => InternalUser, { foreignKey: 'reviewedBy' })
  declare reviewer: BelongsTo<typeof InternalUser>

  /** Whether borrowers can currently see and take this product. */
  get isPublished(): boolean {
    return this.status === 'active'
  }
}
