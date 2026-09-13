import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Reference data for a currency a wallet can be held in (see migration
 * 1799100000000_create_currencies_table.ts). Keyed by its ISO 4217 code.
 */
export default class Currency extends BaseModel {
  static table = 'currencies'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare code: string

  @column()
  declare numericCode: string | null

  @column()
  declare name: string

  @column()
  declare symbol: string | null

  /** ISO 4217 minor units (USD 2, XAF 0, KWD 3) — display information, not the ledger's storage scale. */
  @column()
  declare decimals: number

  /** ISO 3166-1 alpha-2 of the issuing country — null when shared by several countries. */
  @column()
  declare countryCode: string | null

  /** Admin override for the wallet logo; the generated flag/badge is used when null. */
  @column()
  declare logoUrl: string | null

  @column()
  declare isActive: boolean

  @column()
  declare sortOrder: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
