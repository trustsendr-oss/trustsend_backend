import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Rate of one currency against 1 USD (see migration 1799200000000_create_exchange_rates_and_fx_quotes.ts).
 * Decimal columns come back from Postgres as strings and are parsed with fx_math.parseRate.
 */
export default class ExchangeRate extends BaseModel {
  static table = 'exchange_rates'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare currencyCode: string

  /** Last value from the international feed. */
  @column()
  declare marketRate: string | null

  /** Set from the admin panel; takes precedence over marketRate when present. */
  @column()
  declare manualRate: string | null

  /** Spread taken on a swap involving this currency, in basis points (100 = 1%). */
  @column()
  declare marginBps: number

  @column()
  declare marketSource: string | null

  @column.dateTime()
  declare marketUpdatedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
