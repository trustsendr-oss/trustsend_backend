import env from '#start/env'
import Currency from '#models/currency'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class CurrencyNotSupportedException extends Error {
  constructor(readonly currencyCode: string) {
    super(`Currency ${currencyCode} is not supported for new wallets`)
    this.name = 'CurrencyNotSupportedException'
  }
}

export class CurrencyNotFoundException extends Error {
  constructor(readonly currencyCode: string) {
    super(`Currency ${currencyCode} not found`)
    this.name = 'CurrencyNotFoundException'
  }
}

export interface SerializedCurrency {
  code: string
  numeric_code: string | null
  name: string
  symbol: string | null
  decimals: number
  country_code: string | null
  logo_url: string
  is_active: boolean
}

export interface CurrencyChanges {
  name?: string
  symbol?: string | null
  logo_url?: string | null
  is_active?: boolean
  sort_order?: number
}

/**
 * Single source of truth for which currencies exist, how many decimals they carry and what logo
 * a wallet in that currency shows (see Currency / migration 1799100000000_create_currencies_table).
 */
export class CurrencyService {
  static normalize(code: string): string {
    return code.trim().toUpperCase()
  }

  /** Served by AssetsController.currencyLogo — the issuing country's flag or a generated badge. */
  static defaultLogoUrl(code: string): string {
    return `${env.get('APP_URL')}/assets/currencies/${this.normalize(code)}.svg`
  }

  static serialize(currency: Currency): SerializedCurrency {
    return {
      code: currency.code,
      numeric_code: currency.numericCode,
      name: currency.name,
      symbol: currency.symbol,
      decimals: currency.decimals,
      country_code: currency.countryCode,
      logo_url: currency.logoUrl || this.defaultLogoUrl(currency.code),
      is_active: currency.isActive,
    }
  }

  /** For a wallet whose currency is missing from the table (legacy data) — never breaks a listing. */
  static fallback(code: string): SerializedCurrency {
    const normalized = this.normalize(code)
    return {
      code: normalized,
      numeric_code: null,
      name: normalized,
      symbol: null,
      decimals: 2,
      country_code: null,
      logo_url: this.defaultLogoUrl(normalized),
      is_active: false,
    }
  }

  static listActive(): Promise<Currency[]> {
    return Currency.query()
      .where('is_active', true)
      .orderBy('sort_order', 'asc')
      .orderBy('code', 'asc')
  }

  static listAll(filters: { q?: string; isActive?: boolean } = {}): Promise<Currency[]> {
    const query = Currency.query().orderBy('sort_order', 'asc').orderBy('code', 'asc')
    if (filters.isActive !== undefined) {
      query.where('is_active', filters.isActive)
    }
    if (filters.q) {
      const term = `%${filters.q.trim()}%`
      query.where((q) => q.whereILike('code', term).orWhereILike('name', term))
    }
    return query
  }

  static find(code: string): Promise<Currency | null> {
    return Currency.find(this.normalize(code))
  }

  static async findOrFail(code: string): Promise<Currency> {
    const currency = await this.find(code)
    if (!currency) {
      throw new CurrencyNotFoundException(this.normalize(code))
    }
    return currency
  }

  /** @throws CurrencyNotSupportedException when unknown or not open for new wallets */
  static async requireActive(code: string): Promise<Currency> {
    const currency = await this.find(code)
    if (!currency || !currency.isActive) {
      throw new CurrencyNotSupportedException(this.normalize(code))
    }
    return currency
  }

  /** One query for a whole wallet listing, keyed by code. */
  static async serializeMany(codes: string[]): Promise<Map<string, SerializedCurrency>> {
    const unique = [...new Set(codes.map((c) => this.normalize(c)))]
    const rows = unique.length > 0 ? await Currency.query().whereIn('code', unique) : []
    const byCode = new Map(rows.map((row) => [row.code, this.serialize(row)] as const))

    for (const code of unique) {
      if (!byCode.has(code)) {
        byCode.set(code, this.fallback(code))
      }
    }
    return byCode
  }

  /**
   * Admin edit. Code and decimals are deliberately immutable: both are ISO 4217 facts that wallets,
   * ledger accounts and API clients already rely on.
   */
  static async update(
    code: string,
    changes: CurrencyChanges,
    actorId: number,
    correlationId: string
  ): Promise<Currency> {
    const currency = await this.findOrFail(code)
    const before = this.serialize(currency)

    if (changes.name !== undefined) currency.name = changes.name
    if (changes.symbol !== undefined) currency.symbol = changes.symbol || null
    if (changes.logo_url !== undefined) currency.logoUrl = changes.logo_url || null
    if (changes.is_active !== undefined) currency.isActive = changes.is_active
    if (changes.sort_order !== undefined) currency.sortOrder = changes.sort_order

    await currency.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'currency.updated',
      resourceType: 'currency',
      resourceId: currency.code,
      before,
      after: this.serialize(currency),
      correlationId,
    })

    return currency
  }
}
