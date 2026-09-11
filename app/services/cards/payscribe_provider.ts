import cardsConfig from '#config/cards'
import { SecretsProvider } from '#services/security/secrets_provider'
import type { DecryptedCardDetails } from '#services/cards/card_detail_crypto_service'
import {
  CardProviderException,
  type CardActionResult,
  type CardProvider,
  type CardSummary,
  type CardTransactionKind,
  type CardTransactionPage,
  type CreateCardParams,
  type CreateCustomerParams,
  type CreateCustomerResult,
  type SecureDetailsEnvelope,
} from '#services/cards/card_provider'

interface PayscribeEnvelope<T> {
  status: boolean
  description?: string
  message: { details: T }
  status_code: number
}

interface PayscribeCardDetails {
  id: string
  card_type: string
  currency: string
  brand: string
  first_six: string | null
  last_four: string | null
  masked: string | null
  /**
   * Documented as the encrypted delivery channel for card data. The live card endpoints do not
   * send it — see `card_number` below — so it stays optional and is only used when present.
   */
  secure_details?: SecureDetailsEnvelope | null
  /**
   * What the card endpoints actually return: the card data in the clear. Verified against
   * sandbox on 2026-09-07, where GET /cards/:id and GET /cards/:id/details both answer with
   * these three fields as EMPTY strings — a sandbox account has no access to real card data.
   */
  card_number?: string | null
  expiry?: string | null
  ccv?: string | null
  balance?: number | string | null
}

/**
 * The three clear-text fields, or `null` when the provider has nothing to give.
 *
 * Empty strings are treated as absent on purpose: that is how the sandbox — and any account
 * without PCI card-data access — reports "I will not show you this card's number", and passing
 * `""` down the chain would make a client render an empty field as though it were the real value.
 */
function toPlainDetails(details: PayscribeCardDetails): DecryptedCardDetails | null {
  const number = details.card_number?.trim()
  const ccv = details.ccv?.trim()
  const expiry = details.expiry?.trim()

  if (!number && !ccv && !expiry) return null
  return { number: number || '', ccv: ccv || '', expiry: expiry || '' }
}

/**
 * Turns a provider description into a movement kind.
 *
 * The description is the only signal available: `ref_type` is the literal `'cards'` on every row.
 * Matching on keywords is therefore a heuristic, and it says so by returning `unknown` instead of
 * guessing — a client showing "Opération" over the raw text is honest, one showing "Recharge"
 * over a purchase is not.
 *
 * Sandbox descriptions look like `Sandbox card topup for visa 426311 **** 2464`.
 */
function classifyCardTransaction(description?: string): CardTransactionKind {
  const text = (description || '').toLowerCase()
  if (text.includes('topup') || text.includes('top-up') || text.includes('fund')) return 'topup'
  if (text.includes('withdraw')) return 'withdraw'
  if (text.includes('unfreeze')) return 'unfreeze'
  if (text.includes('freeze')) return 'freeze'
  if (text.includes('purchase') || text.includes('payment')) return 'purchase'
  return 'unknown'
}

/**
 * "71.00" → "7100". Card issuing is USD-only today (2 decimals), the same assumption
 * CardService.toDecimalString() makes in the other direction; revisit both together if a
 * currency with a different smallest-unit convention is ever issued.
 *
 * Parsing is done on the string rather than through `Number`, so a large amount cannot lose
 * precision on the way in.
 */
function decimalToSmallestUnit(value: number | string): string {
  const text = String(value).trim()
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace(/^[-+]/, '').split('.')
  const cents = `${whole}${fraction.padEnd(2, '0').slice(0, 2)}`.replace(/^0+(?=\d)/, '')
  return `${negative ? '-' : ''}${cents || '0'}`
}

interface PayscribeCardActionDetails {
  card: {
    id: string
    prev_balance?: number | string
    balance?: number | string
  }
}

/**
 * Payscribe card issuing adapter. See https://docs.payscribe.co/ ("Card Issueing" section) for
 * the source of truth — this class only translates between our CardProvider contract and their
 * actual request/response shapes.
 *
 * IMPORTANT — funding model: unlike a per-request payment, Payscribe funds card creation/top-ups
 * out of OUR OWN pre-funded Payscribe merchant wallet balance (the response to topup/withdraw
 * includes both the CARD's balance AND our merchant wallet's prev_balance/balance, debited
 * automatically on their side). That merchant wallet must be kept funded independently of this
 * integration (bank transfer or the stablecoin flow — see docs) — this class has no way to see
 * or manage it directly. On our side, CardService debits the end user's TumaPlus wallet and
 * credits a CARD_ISSUING_CLEARING platform account, exactly mirroring how
 * mobile_money_deposit_service.ts treats MOBILE_MONEY_CLEARING: it's our own ledger's record of
 * money tied up in customer cards, not a live view of the Payscribe merchant wallet itself (see
 * card_reconciliation, once it exists, for comparing the two — not implemented yet).
 *
 * getCardTransactions()'s response shape is NOT verified against a captured sandbox response
 * (the docs didn't show one) — same caveat as pawapay_signature_service.ts's header-shape note.
 * Confirm the real shape in sandbox before relying on this for anything beyond a rough list.
 */
export class PayscribeProvider implements CardProvider {
  readonly name = 'payscribe'

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: { body?: unknown; query?: Record<string, string | undefined> } = {}
  ): Promise<T> {
    const url = new URL(`${cardsConfig.payscribe.baseUrl}${path}`)
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${SecretsProvider.getPayscribeApiToken()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(cardsConfig.payscribe.requestTimeoutMs),
      })
    } catch (error) {
      const err = error as Error
      throw new CardProviderException(`Payscribe request failed: ${err.message}`)
    }

    const json = (await response.json().catch(() => null)) as {
      status?: boolean
      description?: string
    } | null

    if (!response.ok || json?.status === false) {
      throw new CardProviderException(
        `Payscribe returned ${response.status}: ${json?.description || JSON.stringify(json)}`
      )
    }

    return json as T
  }

  private toCardSummary(details: PayscribeCardDetails): CardSummary {
    return {
      providerCardId: details.id,
      brand: details.brand,
      cardType: details.card_type,
      currencyCode: details.currency,
      firstSix: details.first_six,
      lastFour: details.last_four,
      masked: details.masked,
      secureDetails: details.secure_details ?? null,
      plainDetails: toPlainDetails(details),
      balance:
        details.balance !== undefined && details.balance !== null ? String(details.balance) : null,
    }
  }

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    // Payscribe wants first/last name separately; TumaPlus only carries a single fullName field
    // (see User/Business models) — split on the first space, falling back to repeating the whole
    // name as both if there's no space (better than sending an empty required field).
    const spaceIndex = params.fullName.trim().indexOf(' ')
    const firstName =
      spaceIndex === -1 ? params.fullName.trim() : params.fullName.slice(0, spaceIndex)
    const lastName =
      spaceIndex === -1 ? params.fullName.trim() : params.fullName.slice(spaceIndex + 1).trim()

    const result = await this.request<PayscribeEnvelope<{ customer_id: string }>>(
      'POST',
      '/customers/create',
      {
        body: {
          first_name: firstName,
          last_name: lastName || firstName,
          phone: params.phone,
          email: params.email,
          country: 'NG',
        },
      }
    )

    return { providerCustomerId: result.message.details.customer_id }
  }

  async createCard(params: CreateCardParams): Promise<CardSummary> {
    const result = await this.request<PayscribeEnvelope<{ card: PayscribeCardDetails }>>(
      'POST',
      '/cards/create',
      {
        body: {
          customer_id: params.providerCustomerId,
          currency: params.currencyCode,
          brand: params.brand,
          amount: params.amount,
          type: 'virtual',
          ref: params.reference,
        },
      }
    )
    return this.toCardSummary(result.message.details.card)
  }

  async getCardDetails(providerCardId: string): Promise<CardSummary> {
    const result = await this.request<PayscribeEnvelope<PayscribeCardDetails>>(
      'GET',
      `/cards/${providerCardId}`
    )
    return this.toCardSummary(result.message.details)
  }

  async topupCard(
    providerCardId: string,
    amount: string,
    reference: string
  ): Promise<CardActionResult> {
    const result = await this.request<PayscribeEnvelope<PayscribeCardActionDetails>>(
      'PATCH',
      `/cards/${providerCardId}/topup`,
      { body: { amount, ref: reference } }
    )
    const balance = result.message.details.card.balance
    return { balance: balance !== undefined ? String(balance) : null }
  }

  async withdrawFromCard(
    providerCardId: string,
    amount: string,
    reference: string
  ): Promise<CardActionResult> {
    const result = await this.request<PayscribeEnvelope<PayscribeCardActionDetails>>(
      'PATCH',
      `/cards/${providerCardId}/withdraw`,
      { body: { amount, ref: reference } }
    )
    const balance = result.message.details.card.balance
    console.log(result)
    return { balance: balance !== undefined ? String(balance) : null }
  }

  async freezeCard(providerCardId: string, reference: string): Promise<void> {
    await this.request('PATCH', `/cards/${providerCardId}/freeze`, { body: { ref: reference } })
  }

  async unfreezeCard(providerCardId: string, reference: string): Promise<void> {
    await this.request('PATCH', `/cards/${providerCardId}/unfreeze`, { body: { ref: reference } })
  }

  async terminateCard(providerCardId: string, reference: string): Promise<void> {
    await this.request('POST', `/cards/${providerCardId}/terminate`, { body: { ref: reference } })
  }

  /**
   * Shape captured from sandbox on 2026-09-07 against a card with six real movements, replacing
   * the guessed shape this method was first written to. Each row carries `currency`, `name`,
   * `masked`, `balance`, `status`, `ref_id`, `ref_type`, `amount`, `created_at`, `trans_id` and
   * `description`, and the envelope adds `total` / `page` / `page_size`.
   *
   * Two things the previous mapping got wrong and silently passed on:
   *  - amounts arrive as DECIMAL strings ("71.00"), not smallest units. Everything else in this
   *    codebase counts in smallest units, so they are converted here rather than leaving every
   *    caller to guess which convention a given number follows.
   *  - `total` / `page` / `page_size` were dropped, so no client could page through the list.
   *
   * `start_date` and `end_date` are mandatory: without them the provider answers 400.
   */
  async getCardTransactions(
    providerCardId: string,
    params: { startDate: string; endDate: string; page?: number; pageSize?: number }
  ): Promise<CardTransactionPage> {
    const result = await this.request<
      PayscribeEnvelope<{
        transactions?: Array<{
          trans_id: string
          amount: number | string
          currency?: string
          balance?: number | string | null
          status?: string
          description?: string
          created_at: string
        }>
        total?: number
        page?: number
        page_size?: number
      }>
    >('GET', `/cards/${providerCardId}/transactions`, {
      query: {
        start_date: params.startDate,
        end_date: params.endDate,
        page: params.page ? String(params.page) : undefined,
        page_size: params.pageSize ? String(params.pageSize) : undefined,
      },
    })

    const details = result.message.details
    const rows = details.transactions || []
    console.log(details)

    return {
      transactions: rows.map((t) => ({
        transactionId: t.trans_id,
        kind: classifyCardTransaction(t.description),
        status: t.status || 'unknown',
        amount: decimalToSmallestUnit(t.amount),
        currencyCode: t.currency || '',
        balanceAfter:
          t.balance === undefined || t.balance === null ? null : decimalToSmallestUnit(t.balance),
        description: t.description || '',
        createdAt: t.created_at,
      })),
      total: details.total ?? rows.length,
      page: details.page ?? params.page ?? 1,
      pageSize: details.page_size ?? params.pageSize ?? rows.length,
    }
  }
}
