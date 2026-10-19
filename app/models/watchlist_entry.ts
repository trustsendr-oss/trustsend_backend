import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** A name to hold for compliance review before any remittance payout (see ScreeningService). */
export default class WatchlistEntry extends BaseModel {
  static table = 'watchlist_entries'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string

  @column()
  declare normalizedName: string

  @column()
  declare source: string

  @column()
  declare reference: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
