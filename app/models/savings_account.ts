import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import FinancialProduct from '#models/financial_product'
import User from '#models/user'
import Wallet from '#models/wallet'

export type SavingsAccountStatus = 'active' | 'matured' | 'closed'

/**
 * Savings held with a partner institution, in an escrow wallet owned by the saver.
 *
 * The rate and period are the ones agreed at opening, copied from the product rather than read
 * from it: repricing a product must never reach a saver who already signed up under different
 * terms.
 */
export default class SavingsAccount extends BaseModel {
  static table = 'savings_accounts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare productId: number

  @column()
  declare providerId: number

  @column()
  declare userId: number

  /** The escrow wallet holding the balance. One per account, never shared. */
  @column()
  declare walletId: number

  @column()
  declare currencyCode: string

  @column()
  declare status: SavingsAccountStatus

  @column.dateTime()
  declare openedAt: DateTime

  /** Term deposits only; null means withdrawable at any time. */
  @column.dateTime()
  declare maturesAt: DateTime | null

  @column.dateTime()
  declare closedAt: DateTime | null

  @column()
  declare interestRateBps: number

  @column()
  declare interestPeriod: 'month' | 'year'

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
  declare saver: BelongsTo<typeof User>

  @belongsTo(() => Wallet, { foreignKey: 'walletId' })
  declare wallet: BelongsTo<typeof Wallet>

  /**
   * Whether money can be taken out right now. A term deposit is locked until its date — that lock
   * is what the institution is paying a higher rate for.
   */
  get isWithdrawable(): boolean {
    if (this.status === 'closed') return false
    if (!this.maturesAt) return true
    return this.maturesAt <= DateTime.now()
  }
}
