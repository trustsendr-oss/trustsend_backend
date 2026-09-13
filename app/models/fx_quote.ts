import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** A swap rate locked for a short time for one owner (see SwapService). */
export default class FxQuote extends BaseModel {
  static table = 'fx_quotes'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare ownerType: 'user' | 'business'

  @column()
  declare ownerId: number

  @column()
  declare fromWalletId: number

  @column()
  declare toWalletId: number

  @column()
  declare fromCurrency: string

  @column()
  declare toCurrency: string

  @column()
  declare amountIn: bigint

  @column()
  declare amountOut: bigint

  /** In the target currency. */
  @column()
  declare fee: bigint

  @column()
  declare midRate: string

  /** Rate the customer gets, margin included. */
  @column()
  declare rate: string

  @column()
  declare marginBps: number

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column()
  declare ledgerTransactionId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
