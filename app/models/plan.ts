import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/orm'
import Business from '#models/business'

/**
 * A feature is either unrestricted (`true`) or scoped to specific currencies/countries — omitted
 * entirely from the map means disabled. `currencies`/`countries`, when present, are allow-lists:
 * only those values pass; leaving one of the two keys out means that dimension isn't restricted
 * (e.g. `{ currencies: ['ZMW'] }` allows ZMW in any country). An empty array is deliberately NOT
 * the same as omitting the key — `{ currencies: [] }` allows no currency at all (a plan admin
 * mistake, not a footgun this type tries to prevent, since it's a legitimate way to soft-disable
 * a feature without removing its key).
 */
export type PlanFeatureRestriction = true | { currencies?: string[]; countries?: string[] }
export type PlanFeatures = Record<string, PlanFeatureRestriction>

export interface PlanFeatureContext {
  currencyCode?: string
  countryCode?: string
}

/**
 * Plan — a pricing tier that gates which business-facing APIs a Business may call. Enforcement
 * happens in business_plan_middleware.ts via PlanService.hasFeature(); this model is just the
 * data. `features` maps a feature key (e.g. "mobile_money.deposits" — see
 * business_plan_middleware.ts for the keys actually checked) to its restriction — no separate
 * join table, since a plan's feature list is only ever read/written as a whole via the admin API,
 * never queried per-feature. Was a flat string[] (unrestricted-only) before migration
 * 1793200000000_convert_plan_features_to_restriction_map — that migration converted every
 * existing `"key"` array entry to `"key": true`, so nothing lost currency/country-unrestricted
 * access when this changed.
 */
export default class Plan extends BaseModel {
  static table = 'plans'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare description: string | null

  // A plain JS object bind param is already JSON.stringify'd by node-pg for a jsonb column (same
  // as the `metadata` columns elsewhere in this codebase) — no custom `prepare` needed here,
  // unlike when this column held a bare array (see git history: arrays serialize as a Postgres
  // ARRAY literal instead, which IS invalid for jsonb).
  @column()
  declare features: PlanFeatures

  @column()
  declare status: 'active' | 'archived'

  /** One-time fee charged (see PlanService.subscribe) when a business subscribes to this plan. */
  @column()
  declare price: bigint

  /** Recurring monthly fee (see PlanService.chargeDueMaintenanceFees) — 0 means no recurring charge. */
  @column()
  declare maintenancePrice: bigint

  /** Currency both price and maintenancePrice are denominated in. */
  @column()
  declare currencyCode: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Business, { foreignKey: 'planId' })
  declare businesses: HasMany<typeof Business>

  /**
   * Whether this plan grants `featureKey`, optionally scoped to a currency/country. Omit
   * `context` (or its fields) for feature checks that have no currency/country dimension at all
   * (e.g. "webhooks") — a restriction on a dimension the caller didn't provide context for is
   * simply not checked (there's nothing to compare against), NOT treated as a failure. The
   * caller (business_plan_middleware.ts) is responsible for passing the right context on routes
   * where it's actually relevant.
   */
  hasFeature(featureKey: string, context?: PlanFeatureContext): boolean {
    const restriction = this.features[featureKey]

    if (restriction === undefined) return false
    if (restriction === true) return true

    if (restriction.currencies && context?.currencyCode) {
      if (!restriction.currencies.includes(context.currencyCode)) return false
    }
    if (restriction.countries && context?.countryCode) {
      if (!restriction.countries.includes(context.countryCode)) return false
    }
    return true
  }
}
