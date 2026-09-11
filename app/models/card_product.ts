import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * CardProduct — a category a virtual card is sold under.
 *
 * Every amount is in the smallest unit of `currencyCode`, as everywhere else in this codebase.
 * A `null` limit means "no ceiling": a category that does not restrict something has to be
 * distinguishable from one that restricts it to zero.
 *
 * The catalogue is data rather than configuration because staff price it, not deployments —
 * same reasoning as `plans`, whose shape this follows. Enforcement lives in CardProductService;
 * this model is just the row.
 */
export default class CardProduct extends BaseModel {
  static table = 'card_products'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare currencyCode: string

  @column()
  declare issuancePrice: bigint

  @column()
  declare maxBalance: bigint | null

  @column()
  declare maxActiveCards: number | null

  @column()
  declare perTopupLimit: bigint | null

  @column()
  declare dailyTopupLimit: bigint | null

  @column()
  declare monthlyTopupLimit: bigint | null

  /** Référence opaque du visuel stocké ; `null` tant qu'aucun n'a été téléversé. */
  @column()
  declare imageRef: string | null

  /** Type capturé au téléversement, pour ne pas avoir à le deviner à la lecture. */
  @column()
  declare imageMimeType: string | null

  /** `archived` hides a category from the catalogue without touching the cards already sold. */
  @column()
  declare status: 'active' | 'archived'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
