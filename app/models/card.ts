import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import Wallet from '#models/wallet'

export default class Card extends BaseModel {
  static table = 'cards'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare businessId: number | null

  @column()
  declare walletId: number

  /**
   * Catégorie sous laquelle la carte a été vendue. `null` pour les cartes
   * émises avant le catalogue : leur imposer une catégorie prétendrait
   * qu'elles ont été vendues à des conditions qui n'existaient pas.
   */
  @column()
  declare cardProductId: number | null

  @column()
  declare provider: string

  @column()
  declare providerCardId: string | null

  @column()
  declare brand: string

  @column()
  declare cardType: string

  @column()
  declare currencyCode: string

  @column()
  declare status: 'pending' | 'active' | 'frozen' | 'terminated' | 'failed'

  @column()
  declare firstSix: string | null

  @column()
  declare lastFour: string | null

  @column()
  declare masked: string | null

  @column()
  declare balanceCache: bigint

  @column()
  declare failureReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Wallet, { foreignKey: 'walletId' })
  declare wallet: BelongsTo<typeof Wallet>
}
