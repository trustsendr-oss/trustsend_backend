import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import Currency from '#models/currency'
import ExchangeRate from '#models/exchange_rate'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { CurrencyService, CurrencyNotFoundException } from '#services/money/currency_service'
import { applyMargin, crossRate, formatRate, parseRate, RATE_DECIMALS, RATE_SCALE } from '#services/fx/fx_math'

export const BASE_CURRENCY = 'USD'

// ExchangeRate-API open access: no key, 160+ currencies (CDF, XAF, BIF…), published once a day.
// Its terms require attribution wherever the rates are displayed.
const DEFAULT_FEED_URL = 'https://open.er-api.com/v6/latest/USD'
export const RATE_ATTRIBUTION = { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' }

const FEED_TIMEOUT_MS = 8000
/** Past this age a swap quote triggers a background-safe refresh first. */
const REFRESH_AFTER_HOURS = 6
/** A market rate older than this is not used (a feed outage must not freeze stale rates in). */
const MAX_MARKET_RATE_AGE_HOURS = 72

export class ExchangeRateUnavailableException extends Error {
  constructor(readonly currencyCode: string) {
    super(`No usable exchange rate for ${currencyCode}, try again later`)
    this.name = 'ExchangeRateUnavailableException'
  }
}

export class ExchangeRateFeedException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExchangeRateFeedException'
  }
}

export class BaseCurrencyRateException extends Error {
  constructor() {
    super(`${BASE_CURRENCY} is the base currency: its rate is always 1`)
    this.name = 'BaseCurrencyRateException'
  }
}

export type RateSource = 'base' | 'manual' | 'market'

export interface EffectiveRate {
  currencyCode: string
  perUsd: bigint
  source: RateSource
  marginBps: number
  updatedAt: DateTime | null
}

export interface PairRate {
  from: EffectiveRate
  to: EffectiveRate
  midRate: bigint
  marginBps: number
  rate: bigint
}

function isFresh(row: ExchangeRate, hours: number): boolean {
  return !!row.marketUpdatedAt && row.marketUpdatedAt > DateTime.now().minus({ hours })
}

function toDbDecimal(scaled: bigint): string {
  return formatRate(scaled, RATE_DECIMALS)
}

/**
 * Exchange rates, all expressed per 1 USD. A rate is the admin's manual rate when set, otherwise
 * the international market rate if it is recent enough; cross rates go through USD.
 */
export class ExchangeRateService {
  private static inflightRefresh: Promise<{ updated: number }> | null = null

  static feedUrl(): string {
    return env.get('FX_RATES_URL') || DEFAULT_FEED_URL
  }

  /** Pulls the latest market rates for every currency of the reference table. */
  static async refreshMarketRates(): Promise<{ updated: number }> {
    if (this.inflightRefresh) return this.inflightRefresh

    this.inflightRefresh = (async () => {
      const url = this.feedUrl()
      let payload: any
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FEED_TIMEOUT_MS) })
        if (!res.ok) throw new ExchangeRateFeedException(`Rate feed answered HTTP ${res.status}`)
        payload = await res.json()
      } catch (error) {
        if (error instanceof ExchangeRateFeedException) throw error
        throw new ExchangeRateFeedException(`Rate feed unreachable: ${(error as Error).message}`)
      }

      const rates = payload?.rates
      if ((payload?.result && payload.result !== 'success') || !rates || typeof rates !== 'object') {
        throw new ExchangeRateFeedException('Rate feed returned an unexpected payload')
      }

      const source = new URL(url).host
      const now = DateTime.now()
      const codes = (await Currency.query().select('code')).map((c) => c.code)
      let updated = 0

      await db.transaction(async (trx) => {
        for (const code of codes) {
          const raw = code === BASE_CURRENCY ? 1 : rates[code]
          if (typeof raw !== 'number' || !(raw > 0)) continue

          await ExchangeRate.updateOrCreate(
            { currencyCode: code },
            { marketRate: toDbDecimal(parseRate(raw)), marketSource: source, marketUpdatedAt: now },
            { client: trx }
          )
          updated++
        }
      })

      return { updated }
    })()

    try {
      return await this.inflightRefresh
    } finally {
      this.inflightRefresh = null
    }
  }

  /** Refreshes first when a needed market rate is old; never fails the caller. */
  static async refreshIfStale(codes: string[]): Promise<void> {
    const rows = await ExchangeRate.query().whereIn('currency_code', codes)
    const stale = codes.some((code) => {
      if (code === BASE_CURRENCY) return false
      const row = rows.find((r) => r.currencyCode === code)
      return !row || (!row.manualRate && !isFresh(row, REFRESH_AFTER_HOURS))
    })
    if (!stale) return

    try {
      await this.refreshMarketRates()
    } catch (error) {
      logger.warn({ err: error }, 'Exchange rate refresh failed, using stored rates')
    }
  }

  static resolve(code: string, row: ExchangeRate | null | undefined): EffectiveRate | null {
    const marginBps = row?.marginBps ?? 0
    if (code === BASE_CURRENCY) {
      return { currencyCode: code, perUsd: RATE_SCALE, source: 'base', marginBps, updatedAt: null }
    }
    if (!row) return null
    if (row.manualRate) {
      return { currencyCode: code, perUsd: parseRate(row.manualRate), source: 'manual', marginBps, updatedAt: row.updatedAt }
    }
    if (row.marketRate && isFresh(row, MAX_MARKET_RATE_AGE_HOURS)) {
      return { currencyCode: code, perUsd: parseRate(row.marketRate), source: 'market', marginBps, updatedAt: row.marketUpdatedAt }
    }
    return null
  }

  /** @throws ExchangeRateUnavailableException */
  static async pairRate(fromCode: string, toCode: string): Promise<PairRate> {
    const rows = await ExchangeRate.query().whereIn('currency_code', [fromCode, toCode])
    const from = this.resolve(fromCode, rows.find((r) => r.currencyCode === fromCode))
    if (!from) throw new ExchangeRateUnavailableException(fromCode)
    const to = this.resolve(toCode, rows.find((r) => r.currencyCode === toCode))
    if (!to) throw new ExchangeRateUnavailableException(toCode)

    // The stricter of the two currencies' margins applies to the pair.
    const marginBps = Math.max(from.marginBps, to.marginBps)
    const midRate = crossRate(from.perUsd, to.perUsd)
    return { from, to, midRate, marginBps, rate: applyMargin(midRate, marginBps) }
  }

  /** Mid rates (no margin) of the currencies open for wallets, against `base`. */
  static async listPublic(base = BASE_CURRENCY) {
    const baseCode = CurrencyService.normalize(base)
    const currencies = await CurrencyService.listActive()
    const rows = await ExchangeRate.query().whereIn('currency_code', [...currencies.map((c) => c.code), baseCode])
    const baseRate = this.resolve(baseCode, rows.find((r) => r.currencyCode === baseCode))
    if (!baseRate) throw new ExchangeRateUnavailableException(baseCode)

    const data = []
    for (const currency of currencies) {
      if (currency.code === baseCode) continue
      const rate = this.resolve(currency.code, rows.find((r) => r.currencyCode === currency.code))
      if (!rate) continue
      data.push({
        currency_code: currency.code,
        rate: formatRate(crossRate(baseRate.perUsd, rate.perUsd)),
        source: rate.source,
        updated_at: rate.updatedAt,
      })
    }
    return { base: baseCode, data, attribution: RATE_ATTRIBUTION }
  }

  static serializeAdmin(currency: Currency, row: ExchangeRate | null | undefined) {
    const effective = this.resolve(currency.code, row)
    const marginBps = row?.marginBps ?? 0
    return {
      id: currency.code,
      currency_code: currency.code,
      name: currency.name,
      logo_url: currency.logoUrl || CurrencyService.defaultLogoUrl(currency.code),
      is_active: currency.isActive,
      market_rate: row?.marketRate ? formatRate(parseRate(row.marketRate)) : currency.code === BASE_CURRENCY ? '1' : null,
      manual_rate: row?.manualRate ? formatRate(parseRate(row.manualRate)) : null,
      effective_rate: effective ? formatRate(effective.perUsd) : null,
      source: effective?.source ?? null,
      margin_bps: marginBps,
      margin_percent: marginBps / 100,
      market_source: row?.marketSource ?? null,
      market_updated_at: row?.marketUpdatedAt ?? null,
      is_stale: currency.code !== BASE_CURRENCY && !row?.manualRate && (!row || !isFresh(row, MAX_MARKET_RATE_AGE_HOURS)),
      updated_at: row?.updatedAt ?? null,
    }
  }

  /** Active currencies plus any currency that already has a rate row. */
  static async listForAdmin() {
    const rows = await ExchangeRate.all()
    const withRows = rows.map((r) => r.currencyCode)
    const currencies = await Currency.query()
      .where((q) => q.where('is_active', true).orWhereIn('code', withRows))
      .orderBy('sort_order', 'asc')
      .orderBy('code', 'asc')
    return currencies.map((c) => this.serializeAdmin(c, rows.find((r) => r.currencyCode === c.code)))
  }

  static async findForAdmin(code: string) {
    const currency = await CurrencyService.findOrFail(code)
    const row = await ExchangeRate.find(currency.code)
    return this.serializeAdmin(currency, row)
  }

  /**
   * @throws CurrencyNotFoundException, BaseCurrencyRateException
   */
  static async update(
    code: string,
    changes: { manual_rate?: string | null; margin_bps?: number },
    actorId: number,
    correlationId: string
  ) {
    const currency = await CurrencyService.findOrFail(code)
    if (currency.code === BASE_CURRENCY && changes.manual_rate) {
      throw new BaseCurrencyRateException()
    }

    const row = (await ExchangeRate.find(currency.code)) ?? new ExchangeRate()
    const before = this.serializeAdmin(currency, row.$isPersisted ? row : null)

    row.currencyCode = currency.code
    if (changes.manual_rate !== undefined) {
      row.manualRate = changes.manual_rate ? toDbDecimal(parseRate(changes.manual_rate)) : null
    }
    if (changes.margin_bps !== undefined) row.marginBps = changes.margin_bps
    if (row.marginBps === undefined) row.marginBps = 0
    await row.save()

    const after = this.serializeAdmin(currency, row)
    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'exchange_rate.updated',
      resourceType: 'exchange_rate',
      resourceId: currency.code,
      before,
      after,
      correlationId,
    })
    return after
  }
}

export { CurrencyNotFoundException }
