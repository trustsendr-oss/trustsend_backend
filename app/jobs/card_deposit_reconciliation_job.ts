import { CardDepositService } from '#services/card_payments/card_deposit_service'
import { GoFreshPayGateway } from '#services/card_payments/gofreshpay_gateway'

/**
 * Card top-ups whose charge answer never arrived are settled by asking GoFreshPay for their
 * status; checkouts abandoned before any charge are closed. Scheduled in app/queue/workers.ts.
 */
export async function handleCardDepositReconciliation() {
  const result = await CardDepositService.sweep(new GoFreshPayGateway())
  if (result.settled > 0 || result.expired > 0) {
    console.log(
      `[card-deposits] checked ${result.checked}, settled ${result.settled}, expired ${result.expired}`
    )
  }
  return result
}
