import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Rate and fees shown to a remittance sender, locked briefly (see RemittanceService.quote). */
export default class RemittanceQuote extends BaseModel {
  static table = 'remittance_quotes'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare senderUserId: number

  @column()
  declare sourceWalletId: number

  @column()
  declare sourceCurrency: string

  @column()
  declare payoutCurrency: string

  @column()
  declare sendAmount: bigint

  @column()
  declare fee: bigint

  @column()
  declare payoutAmount: bigint

  @column()
  declare fxMargin: bigint

  @column()
  declare midRate: string | null

  @column()
  declare rate: string | null

  @column()
  declare payoutMethod: string | null

  @column()
  declare payoutProviderCode: string | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
