import type CardDepositSession from '#models/card_deposit_session'
import { Money } from '#services/money/money'

/** The one shape a card top-up takes in API responses, for the app and the checkout page alike. */
export function cardDepositResource(session: CardDepositSession) {
  return {
    id: session.id,
    status: session.status,
    amount: session.amount.toString(),
    currency_code: session.currencyCode,
    amount_label: new Money(session.amount, session.currencyCode).toString(),
    merchant_reference: session.merchantReference,
    transaction_id: session.ledgerTransactionId,
    card_scheme: session.cardScheme,
    card_last4: session.cardLast4,
    failure_code: session.failureCode,
    failure_message: session.failureMessage,
    expires_at: session.expiresAt,
    completed_at: session.completedAt,
    created_at: session.createdAt,
  }
}
