import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Business from '#models/business'
import Wallet from '#models/wallet'

export default class CryptoDepositAddress extends BaseModel {
  static table = 'crypto_deposit_addresses'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare businessId: number | null

  @column()
  declare walletId: number

  @column()
  declare network: string

  @column()
  declare tokenSymbol: string

  @column()
  declare address: string

  @column()
  declare memoTag: string | null

  @column()
  declare status: 'active' | 'revoked'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Business)
  declare business: BelongsTo<typeof Business>

  @belongsTo(() => Wallet)
  declare wallet: BelongsTo<typeof Wallet>
}
