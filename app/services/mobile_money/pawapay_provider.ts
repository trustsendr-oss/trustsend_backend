import mobileMoneyConfig from '#config/mobile_money'
import { SecretsProvider } from '#services/security/secrets_provider'
import type {
  InitiateDepositParams,
  InitiatePayoutParams,
  InitiateResult,
  MobileMoneyProvider,
  StatusResult,
} from '#services/mobile_money/provider'

export class PawaPayRequestException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PawaPayRequestException'
  }
}

type OperationType = 'DEPOSIT' | 'PAYOUT' | 'REMITTANCE' | 'REFUND' | 'USSD_DEPOSIT'
type DecimalsInAmount = 'TWO_PLACES' | 'NONE'

/**
 * One step of the USSD sequence a payer follows to authorise a deposit. `text` is already
 * interpolated by PawaPay and is what gets displayed; `template` + the channel's `variables`
 * are only needed to re-render it with custom styling, so we drop them (they survive on
 * getRawPaymentMethodsData()).
 */
interface ActiveConfigInstructionStep {
  text: string
  template: string
}

interface ActiveConfigInstructionChannel {
  /** 'USSD' is the only type PawaPay sends today — kept open, since they can add others */
  type: string
  /** localised heading for the step list, keyed by language */
  displayName?: Record<string, string>
  /** a single dialable string that replays the whole sequence, when the operator offers one */
  quickLink?: string
  variables?: Record<string, string>
  /** ordered steps keyed by language */
  instructions: Record<string, ActiveConfigInstructionStep[]>
}

interface ActiveConfigOperation {
  status: 'OPERATIONAL' | 'DELAYED' | 'CLOSED'
  minAmount: string
  maxAmount: string
  decimalsInAmount: DecimalsInAmount
  /**
   * How the payer authorises the transaction. Only ever present on DEPOSIT — a payout needs no
   * approval from the recipient. AUTOMATIC: the operator pushes a PIN prompt to the handset, so
   * the steps below are a fallback for when it doesn't arrive. MANUAL: nothing is pushed and
   * the payer MUST dial the sequence themselves, or the deposit simply expires.
   */
  pinPrompt?: 'AUTOMATIC' | 'MANUAL'
  /** whether a PIN prompt that never arrived can be re-sent */
  pinPromptRevivable?: boolean
  pinPromptInstructions?: { channels: ActiveConfigInstructionChannel[] }
}

/** Authorisation steps for one payment method, flattened for API consumers. */
export interface PaymentMethodAuthorization {
  /** see ActiveConfigOperation.pinPrompt — drives whether steps are a fallback or mandatory */
  pinPrompt: 'AUTOMATIC' | 'MANUAL' | null
  pinPromptRevivable: boolean
  channels: Array<{
    type: string
    displayName: Record<string, string>
    quickLink: string | null
    /** language → ordered, ready-to-display step texts */
    steps: Record<string, string[]>
  }>
}

interface ActiveConfiguration {
  countries: Array<{
    country: string
    /** localised country name keyed by language — PawaPay currently sends `en` and `fr` */
    displayName?: Record<string, string>
    /**
     * International dialling code without the '+', e.g. "229" for Benin. Load-bearing, not
     * decoration: PawaPay expects the MSISDN in E.164 form WITH the country code (their own
     * example is "260763456789" for Zambia), so a client builds the phone_number it sends us
     * as prefix + local number.
     */
    prefix?: string
    /** URL to an SVG flag icon for this country, e.g. "https://static-content.pawapay.io/country_flags/cod.svg" */
    flag?: string
    providers: Array<{
      provider: string
      displayName: string
      /** URL to the operator's logo, e.g. "https://static-content.pawapay.io/provider_logos/moov.png" */
      logo?: string
      currencies: Array<{
        currency: string
        /** currency SYMBOL despite the name — "CFA", "FC", "$" — never a long-form name */
        displayName?: string
        operationTypes: Partial<Record<OperationType, ActiveConfigOperation>>
      }>
    }>
    // `nameDisplayedToCustomer` (per provider) is the one remaining field active-conf sends that
    // nothing here consumes. getRawPaymentMethodsData() still passes it through untouched, since
    // structural typing doesn't strip properties at runtime.
  }>
}

interface AvailabilityResponse {
  country: string
  providers: Array<{
    provider: string
    /** keyed by operation type, mapping straight to a status — NOT an array of {operationType, status} */
    operationTypes: Partial<Record<OperationType, 'OPERATIONAL' | 'DELAYED' | 'CLOSED'>>
  }>
}

export interface ProviderCurrencyConfig {
  provider: string
  currency: string
  status: 'OPERATIONAL' | 'DELAYED' | 'CLOSED'
  /** in OUR smallest-currency-unit convention (see Money) — already converted from PawaPay's decimal string */
  minAmount: bigint
  maxAmount: bigint
  decimalsInAmount: DecimalsInAmount
  /**
   * What the payer must do to authorise, for the controller to hand back on the 202. This is
   * the moment it actually matters — the deposit is pending and the customer is waiting to be
   * told what to do. null when no payer action is needed.
   */
  authorization: PaymentMethodAuthorization | null
}

export interface WalletBalance {
  country: string
  currency: string
  /** in OUR smallest-currency-unit convention (see Money) — already converted from PawaPay's decimal string */
  amount: bigint
}

export interface PaymentMethodSummary {
  provider: string
  displayName: string
  /**
   * URL to the operator's logo as PawaPay sends it, to render a picker row as logo + name
   * rather than a bare provider code. null when active-conf carries none for this provider.
   */
  logo: string | null
  /** ISO 3166-1 alpha-3, from the active-conf country this provider is configured under */
  country: string
  /** localised country name keyed by language ({ en, fr } today), empty object if absent */
  countryName: Record<string, string>
  /**
   * The country's dialling code without '+', e.g. "229". Clients must prepend it to the local
   * number when building `phone_number` for a deposit/payout — see the ActiveConfiguration note.
   */
  phonePrefix: string | null
  /** currency symbol for display, e.g. "CFA" for XOF, "FC" for CDF */
  currencySymbol: string | null
  /** null when this operator needs no payer action (every PAYOUT, and some deposits) */
  authorization: PaymentMethodAuthorization | null
  /**
   * URL to that country's SVG flag icon as PawaPay sends it, so a picker can show an operator
   * next to its flag without the client maintaining its own country→flag mapping. null when
   * active-conf carries no flag for the country — clients must handle that, not assume a URL.
   */
  flag: string | null
  /** the more pessimistic of active-conf's configured status and /v2/availability's live status */
  status: 'OPERATIONAL' | 'DELAYED' | 'CLOSED'
  /** in OUR smallest-currency-unit convention (see Money) — already converted from PawaPay's decimal string */
  minAmount: bigint
  maxAmount: bigint
  decimalsInAmount: DecimalsInAmount
}

/**
 * PawaPay v2 API adapter. See https://docs.pawapay.io/v2/api-reference for the source of
 * truth — this class only translates between our MobileMoneyProvider contract and their
 * actual request/response shapes.
 */
export class PawaPayProvider implements MobileMoneyProvider {
  readonly name = 'pawapay'

  // TTLs live in config/mobile_money.ts so they can be tuned without touching this adapter.
  private static activeConfigCache: { data: ActiveConfiguration; fetchedAt: number } | null = null

  private static availabilityCache: { data: AvailabilityResponse[]; fetchedAt: number } | null = null

  /**
   * The composed listPaymentMethods() result, keyed by `${currency}|${operationType}`. The two
   * caches above already spare PawaPay most round trips, but availability's 30s TTL means a
   * picker rendered by many clients still hits /v2/availability constantly — this layer serves
   * the finished list outright. Bounded by (configured currencies × operation types), so a few
   * dozen entries at most: no eviction policy needed beyond the TTL check on read.
   */
  private static paymentMethodsCache = new Map<
    string,
    { data: PaymentMethodSummary[]; fetchedAt: number }
  >()

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; query?: Record<string, string | undefined> } = {}
  ): Promise<T> {
    const url = new URL(`${mobileMoneyConfig.pawapay.baseUrl}${path}`)
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${SecretsProvider.getPawaPayApiToken()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(mobileMoneyConfig.pawapay.requestTimeoutMs),
      })
    } catch (error) {
      const err = error as Error
      throw new PawaPayRequestException(`PawaPay request failed: ${err.message}`)
    }

    const json = await response.json().catch(() => null)

    if (!response.ok) {
      throw new PawaPayRequestException(
        `PawaPay returned ${response.status}: ${JSON.stringify(json)}`
      )
    }

    return json as T
  }

  async initiateDeposit(params: InitiateDepositParams): Promise<InitiateResult> {
    const config = await this.requireProviderConfig(params.currencyCode, params.providerCode, 'DEPOSIT')

    const result = await this.request<{
      depositId: string
      status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED'
      failureReason?: { failureCode: string; failureMessage: string }
    }>('POST', '/v2/deposits', {
      body: {
        depositId: params.providerReferenceId,
        amount: this.formatAmount(BigInt(params.amount), config.decimalsInAmount),
        currency: params.currencyCode,
        payer: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: params.phoneNumber,
            provider: params.providerCode,
          },
        },
        customerMessage: params.customerMessage,
      },
    })

    return {
      outcome: result.status,
      failureReason: result.failureReason
        ? { code: result.failureReason.failureCode, message: result.failureReason.failureMessage }
        : undefined,
    }
  }

  async initiatePayout(params: InitiatePayoutParams): Promise<InitiateResult> {
    const config = await this.requireProviderConfig(params.currencyCode, params.providerCode, 'PAYOUT')

    const result = await this.request<{
      payoutId: string
      status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED'
      failureReason?: { failureCode: string; failureMessage: string }
    }>('POST', '/v2/payouts', {
      body: {
        payoutId: params.providerReferenceId,
        amount: this.formatAmount(BigInt(params.amount), config.decimalsInAmount),
        currency: params.currencyCode,
        recipient: {
          type: 'MMO',
          accountDetails: {
            phoneNumber: params.phoneNumber,
            provider: params.providerCode,
          },
        },
        customerMessage: params.customerMessage,
      },
    })

    return {
      outcome: result.status,
      failureReason: result.failureReason
        ? { code: result.failureReason.failureCode, message: result.failureReason.failureMessage }
        : undefined,
    }
  }

  async checkDepositStatus(providerReferenceId: string): Promise<StatusResult> {
    const result = await this.request<{
      status: 'FOUND' | 'NOT_FOUND'
      data?: {
        status: 'ACCEPTED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'COMPLETED' | 'FAILED'
        providerTransactionId?: string
        failureReason?: { failureCode: string; failureMessage: string }
      }
    }>('GET', `/v2/deposits/${providerReferenceId}`)

    if (result.status === 'NOT_FOUND' || !result.data) {
      throw new PawaPayRequestException(`Deposit ${providerReferenceId} not found at PawaPay`)
    }

    return {
      status: result.data.status,
      providerTransactionId: result.data.providerTransactionId,
      failureReason: result.data.failureReason
        ? {
            code: result.data.failureReason.failureCode,
            message: result.data.failureReason.failureMessage,
          }
        : undefined,
    }
  }

  async checkPayoutStatus(providerReferenceId: string): Promise<StatusResult> {
    const result = await this.request<{
      status: 'FOUND' | 'NOT_FOUND'
      data?: {
        status: 'ACCEPTED' | 'ENQUEUED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'COMPLETED' | 'FAILED'
        providerTransactionId?: string
        failureReason?: { failureCode: string; failureMessage: string }
      }
    }>('GET', `/v2/payouts/${providerReferenceId}`)

    if (result.status === 'NOT_FOUND' || !result.data) {
      throw new PawaPayRequestException(`Payout ${providerReferenceId} not found at PawaPay`)
    }

    return {
      status: result.data.status,
      providerTransactionId: result.data.providerTransactionId,
      failureReason: result.data.failureReason
        ? {
            code: result.data.failureReason.failureCode,
            message: result.data.failureReason.failureMessage,
          }
        : undefined,
    }
  }

  // ---------------------------------------------------------------------------------------
  // Toolkit endpoints — active configuration, live availability, provider prediction.
  //
  // PawaPay's own docs are explicit that provider codes "should be treated as dynamically
  // fetched, not as a fixed enum" — the merchant's configured countries/providers/currencies
  // (and their min/max amounts, decimal handling) come from THIS account's active-conf, not
  // from a hardcoded list we maintain. See https://docs.pawapay.io/v2/docs/providers
  // ---------------------------------------------------------------------------------------

  /** GET /v2/active-conf — this merchant account's configured countries/providers/currencies. */
  private async getActiveConfiguration(): Promise<ActiveConfiguration> {
    const cached = PawaPayProvider.activeConfigCache
    if (cached && Date.now() - cached.fetchedAt < mobileMoneyConfig.cache.activeConfigTtlMs) {
      return cached.data
    }

    const data = await this.request<ActiveConfiguration>('GET', '/v2/active-conf')
    PawaPayProvider.activeConfigCache = { data, fetchedAt: Date.now() }
    return data
  }

  /**
   * Looks up a provider+currency's configuration (status, bounds, decimal handling) from
   * active-conf. Returns null if this account isn't configured for that combination at all —
   * callers (controllers) should treat that as "unsupported", not fall back to any default.
   */
  async getProviderConfig(
    currencyCode: string,
    providerCode: string,
    operationType: OperationType
  ): Promise<ProviderCurrencyConfig | null> {
    const config = await this.getActiveConfiguration()
    for (const country of config.countries) {
      const provider = country.providers.find((p) => p.provider === providerCode)
      if (!provider) continue

      const currency = provider.currencies.find((c) => c.currency === currencyCode)
      if (!currency) continue

      const operation = currency.operationTypes[operationType]
      if (!operation) continue

      return {
        provider: providerCode,
        currency: currencyCode,
        status: operation.status,
        minAmount: this.parseAmountToMinorUnits(operation.minAmount, operation.decimalsInAmount),
        maxAmount: this.parseAmountToMinorUnits(operation.maxAmount, operation.decimalsInAmount),
        decimalsInAmount: operation.decimalsInAmount,
        authorization: this.extractAuthorization(operation),
      }
    }

    return null
  }

  private async requireProviderConfig(
    currencyCode: string,
    providerCode: string,
    operationType: OperationType
  ): Promise<ProviderCurrencyConfig> {
    const config = await this.getProviderConfig(currencyCode, providerCode, operationType)
    if (!config) {
      throw new PawaPayRequestException(
        `Provider ${providerCode} is not configured for ${currencyCode} ${operationType} on this PawaPay account`
      )
    }
    return config
  }

  /**
   * GET /v2/availability — near-real-time OPERATIONAL/DELAYED/CLOSED status. Distinct from
   * active-conf: a provider can be correctly *configured* (active-conf) yet momentarily down
   * (availability CLOSED). Cached briefly since this is meant to reflect current reality.
   */
  async getAvailability(providerCode: string, operationType: OperationType): Promise<'OPERATIONAL' | 'DELAYED' | 'CLOSED' | 'UNKNOWN'> {
    const data = await this.fetchAvailability()

    for (const country of data) {
      const provider = country.providers.find((p) => p.provider === providerCode)
      if (!provider) continue
      const status = provider.operationTypes[operationType]
      if (status) return status
    }

    return 'UNKNOWN'
  }

  /** Shared cached fetch of /v2/availability, used by getAvailability() and listPaymentMethods(). */
  private async fetchAvailability(): Promise<AvailabilityResponse[]> {
    const cached = PawaPayProvider.availabilityCache
    if (cached && Date.now() - cached.fetchedAt < mobileMoneyConfig.cache.availabilityTtlMs) {
      return cached.data
    }
    const fresh = await this.request<AvailabilityResponse[]>('GET', '/v2/availability')
    PawaPayProvider.availabilityCache = { data: fresh, fetchedAt: Date.now() }
    return fresh
  }

  /**
   * Raw, complete `/v2/active-conf` + `/v2/availability` payloads exactly as PawaPay returns
   * them — no filtering by currency/provider/operation type, no field selection. Everything
   * PawaPay sends survives here (including any field beyond what ActiveConfiguration /
   * AvailabilityResponse declare below): TypeScript's structural typing only narrows what the
   * compiler lets calling code access, it does not strip properties from the actual JSON at
   * runtime, so this passes the full objects straight through.
   */
  async getRawPaymentMethodsData(): Promise<{
    activeConfiguration: ActiveConfiguration
    availability: AvailabilityResponse[]
  }> {
    const [activeConfiguration, availability] = await Promise.all([
      this.getActiveConfiguration(),
      this.fetchAvailability(),
    ])
    return { activeConfiguration, availability }
  }

  /**
   * Lists every provider this merchant account is configured for a given currency + operation
   * type (active-conf), with bounds/decimals, merged with /v2/availability's near-real-time
   * status — a provider correctly configured can still be momentarily down, so the more
   * pessimistic of the two statuses wins rather than active-conf's alone.
   */
  async listPaymentMethods(
    currencyCode: string,
    operationType: OperationType = 'DEPOSIT'
  ): Promise<PaymentMethodSummary[]> {
    const cacheKey = `${currencyCode}|${operationType}`
    const cached = PawaPayProvider.paymentMethodsCache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < mobileMoneyConfig.cache.paymentMethodsTtlMs) {
      return cached.data
    }

    const [config, availability] = await Promise.all([
      this.getActiveConfiguration(),
      this.fetchAvailability(),
    ])

    const liveStatusByProvider = new Map<string, 'OPERATIONAL' | 'DELAYED' | 'CLOSED'>()
    for (const country of availability) {
      for (const provider of country.providers) {
        const status = provider.operationTypes[operationType]
        if (status) liveStatusByProvider.set(provider.provider, status)
      }
    }

    const statusRank = { OPERATIONAL: 0, DELAYED: 1, CLOSED: 2 } as const
    const worseOf = (
      a: 'OPERATIONAL' | 'DELAYED' | 'CLOSED',
      b: 'OPERATIONAL' | 'DELAYED' | 'CLOSED' | undefined
    ) => (b && statusRank[b] > statusRank[a] ? b : a)

    const results: PaymentMethodSummary[] = []

    for (const country of config.countries) {
      for (const provider of country.providers) {
        const currency = provider.currencies.find((c) => c.currency === currencyCode)
        if (!currency) continue

        const operation = currency.operationTypes[operationType]
        if (!operation) continue

        results.push({
          provider: provider.provider,
          displayName: provider.displayName,
          logo: provider.logo || null,
          // Taken from the country this provider is configured under, rather than
          // getFlagForCurrency() — that one resolves a currency to whichever country happens to
          // come first, which is wrong for currencies shared across countries (XOF, XAF).
          country: country.country,
          countryName: country.displayName || {},
          phonePrefix: country.prefix || null,
          currencySymbol: currency.displayName || null,
          authorization: this.extractAuthorization(operation),
          flag: country.flag || null,
          status: worseOf(operation.status, liveStatusByProvider.get(provider.provider)),
          minAmount: this.parseAmountToMinorUnits(operation.minAmount, operation.decimalsInAmount),
          maxAmount: this.parseAmountToMinorUnits(operation.maxAmount, operation.decimalsInAmount),
          decimalsInAmount: operation.decimalsInAmount,
        })
      }
    }

    PawaPayProvider.paymentMethodsCache.set(cacheKey, { data: results, fetchedAt: Date.now() })
    return results
  }

  /**
   * Flattens active-conf's pinPrompt* fields into the shape API consumers get. Returns null
   * when the operation carries no payer-authorisation data at all, so callers can branch on
   * "does this need the customer to do something" without inspecting nested optionals.
   */
  private extractAuthorization(
    operation: ActiveConfigOperation
  ): PaymentMethodAuthorization | null {
    const channels = operation.pinPromptInstructions?.channels ?? []
    if (!operation.pinPrompt && channels.length === 0) return null

    return {
      pinPrompt: operation.pinPrompt ?? null,
      pinPromptRevivable: operation.pinPromptRevivable ?? false,
      channels: channels.map((channel) => ({
        type: channel.type,
        displayName: channel.displayName || {},
        quickLink: channel.quickLink || null,
        steps: Object.fromEntries(
          Object.entries(channel.instructions || {}).map(([language, steps]) => [
            language,
            steps.map((step) => step.text),
          ])
        ),
      })),
    }
  }

  /**
   * Drops every toolkit read cache. Call this after the merchant's PawaPay configuration
   * changes (a new country or provider enabled) instead of waiting out activeConfigTtlMs —
   * otherwise the old list keeps being served for up to an hour.
   */
  static clearToolkitCaches(): void {
    PawaPayProvider.activeConfigCache = null
    PawaPayProvider.availabilityCache = null
    PawaPayProvider.paymentMethodsCache.clear()
  }

  /**
   * Resolves a currency to a country flag icon URL, for display purposes (e.g. next to a
   * wallet). A currency can be shared by several countries (XOF, XAF...) — this returns the
   * first configured country offering that currency in active-conf, not an exhaustive list.
   * Returns null if no configured country offers this currency, or active-conf has no flag
   * for it.
   */
  async getFlagForCurrency(currencyCode: string): Promise<string | null> {
    const config = await this.getActiveConfiguration()

    for (const country of config.countries) {
      const offersCurrency = country.providers.some((provider) =>
        provider.currencies.some((currency) => currency.currency === currencyCode)
      )
      if (offersCurrency) {
        return country.flag || null
      }
    }

    return null
  }

  /**
   * GET /v2/predict-provider — guesses the operator from a phone number, so the app doesn't
   * have to ask the user to pick one manually.
   *
   * NOTE: the exact query parameter name and response shape here are inferred from the same
   * pattern as the other toolkit endpoints (country + phoneNumber query params, `{provider}`-
   * shaped response) — PawaPay's docs page for this endpoint couldn't be fetched while writing
   * this. Verify against a real sandbox call before relying on it, and adjust the query/response
   * parsing below if it doesn't match.
   */
  async predictProvider(phoneNumber: string, country?: string): Promise<string | null> {
    try {
      const result = await this.request<{ country?: string; provider?: string }>(
        'GET',
        '/v2/predict-provider',
        { query: { phoneNumber, country } }
      )
      return result.provider || null
    } catch {
      return null
    }
  }

  /**
   * GET /v2/wallet-balances — our actual funds held at PawaPay right now, per country/currency.
   *
   * This is the ONLY place PawaPay's own fees are ever observable: neither the deposit/payout
   * initiation responses nor the status/callback payloads carry a fee or net-amount field — per
   * PawaPay's docs, "any fees will be deducted from that amount after the collection has
   * completed", silently, on their side. Comparing this balance against our internally-tracked
   * MOBILE_MONEY_CLEARING ledger position is how MobileMoneyReconciliationService surfaces that
   * drift. See MobileMoneyReconciliationService.reconcileWalletBalances().
   */
  async getWalletBalances(country?: string): Promise<WalletBalance[]> {
    const result = await this.request<{
      balances: Array<{ country: string; currency: string; balance: string; provider?: string }>
    }>('GET', '/v2/wallet-balances', { query: { country } })

    return result.balances.map((b) => ({
      country: b.country,
      currency: b.currency,
      amount: this.parseAmountToMinorUnits(b.balance, 'TWO_PLACES'),
    }))
  }

  /** Converts our internal smallest-unit bigint (see Money) to PawaPay's expected decimal string. */
  private formatAmount(amountMinorUnits: bigint, decimalsInAmount: DecimalsInAmount): string {
    const negative = amountMinorUnits < 0n
    const abs = negative ? -amountMinorUnits : amountMinorUnits

    if (decimalsInAmount === 'NONE') {
      // Round to the nearest whole major unit.
      const majorUnits = (abs + 50n) / 100n
      return `${negative ? '-' : ''}${majorUnits.toString()}`
    }

    const majorUnits = abs / 100n
    const minorRemainder = (abs % 100n).toString().padStart(2, '0')
    return `${negative ? '-' : ''}${majorUnits.toString()}.${minorRemainder}`
  }

  /** Inverse of formatAmount — PawaPay's decimal string back to our internal smallest-unit bigint. */
  private parseAmountToMinorUnits(decimalAmount: string, decimalsInAmount: DecimalsInAmount): bigint {
    const negative = decimalAmount.startsWith('-')
    const clean = negative ? decimalAmount.slice(1) : decimalAmount

    if (decimalsInAmount === 'NONE') {
      return (negative ? -1n : 1n) * BigInt(clean) * 100n
    }

    const [wholePart, fractionalPart = '0'] = clean.split('.')
    const fraction = fractionalPart.padEnd(2, '0').slice(0, 2)
    const minorUnits = BigInt(wholePart) * 100n + BigInt(fraction)
    return negative ? -minorUnits : minorUnits
  }
}
