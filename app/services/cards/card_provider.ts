import type { DecryptedCardDetails } from '#services/cards/card_detail_crypto_service'

/**
 * Contract every card issuing provider integration must implement. Business services
 * (CardService) talk only to this interface, never to a provider's HTTP client directly —
 * swapping or adding a provider later means writing one new adapter, not touching controllers or
 * ledger logic. Mirrors app/services/mobile_money/provider.ts's shape and reasoning.
 */

export interface CreateCustomerParams {
  fullName: string
  email: string
  phone: string
}

export interface CreateCustomerResult {
  providerCustomerId: string
}

/** AES-256-GCM envelope Payscribe returns instead of plaintext card number/CVV/expiry. */
export interface SecureDetailsEnvelope {
  alg: string
  iv: string
  tag: string
  data: string
  aad: string
}

export interface CreateCardParams {
  providerCustomerId: string
  brand: 'VISA' | 'MASTERCARD'
  currencyCode: string
  /** smallest-unit-free decimal string, as the provider expects (e.g. "5" for $5.00) */
  amount: string
  reference: string
}

export interface CardSummary {
  providerCardId: string
  brand: string
  cardType: string
  currencyCode: string
  firstSix: string | null
  lastFour: string | null
  masked: string | null
  secureDetails: SecureDetailsEnvelope | null
  /**
   * Card number, expiry and CCV when the provider returns them in the clear.
   *
   * Payscribe documents an encrypted `secure_details` envelope, but its card endpoints answer
   * with plain `card_number` / `expiry` / `ccv` fields instead — empty strings on an account
   * without PCI card-data access, which is why this is nullable and why empty values are
   * normalised away rather than passed through as "".
   */
  plainDetails: DecryptedCardDetails | null
  balance: string | null
}

export interface CardActionResult {
  balance: string | null
}

/**
 * What kind of movement a card line represents.
 *
 * Payscribe does not label these: `ref_type` is the constant `'cards'` on every row, so the only
 * signal is the description text. `unknown` is a real outcome, not a fallback to hide — the
 * client shows the raw description in that case rather than guessing.
 */
export type CardTransactionKind =
  'topup' | 'withdraw' | 'freeze' | 'unfreeze' | 'purchase' | 'unknown'

export interface CardTransaction {
  transactionId: string
  kind: CardTransactionKind
  /** Provider status, verbatim — 'success' is the only value seen in sandbox. */
  status: string
  /** Smallest currency unit, as a digit string — the convention used everywhere else. */
  amount: string
  currencyCode: string
  /** Card balance after the movement, smallest unit. `null` when the provider omits it. */
  balanceAfter: string | null
  description: string
  createdAt: string
}

/** One page of card movements, with what the provider says about the whole set. */
export interface CardTransactionPage {
  transactions: CardTransaction[]
  total: number
  page: number
  pageSize: number
}

export class CardProviderException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardProviderException'
  }
}

export interface CardProvider {
  readonly name: string

  createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult>
  createCard(params: CreateCardParams): Promise<CardSummary>
  getCardDetails(providerCardId: string): Promise<CardSummary>
  topupCard(providerCardId: string, amount: string, reference: string): Promise<CardActionResult>
  withdrawFromCard(
    providerCardId: string,
    amount: string,
    reference: string
  ): Promise<CardActionResult>
  freezeCard(providerCardId: string, reference: string): Promise<void>
  unfreezeCard(providerCardId: string, reference: string): Promise<void>
  terminateCard(providerCardId: string, reference: string): Promise<void>
  getCardTransactions(
    providerCardId: string,
    params: { startDate: string; endDate: string; page?: number; pageSize?: number }
  ): Promise<CardTransactionPage>
}
