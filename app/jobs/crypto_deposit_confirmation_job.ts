import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'

/**
 * Credits stablecoin deposits once the chain has confirmed them.
 *
 * The webhook only records a transfer as pending; this job re-reads each one from the node
 * (receipt, Transfer log, block depth) and credits it when it is final, or rejects it when the
 * chain contradicts the report. Scheduled in app/queue/workers.ts.
 */
export async function handleCryptoDepositConfirmation() {
  const result = await CryptoDepositService.confirmPending()
  if (result.credited > 0 || result.rejected > 0) {
    console.log(
      `[crypto] deposits: ${result.credited} credited, ${result.rejected} rejected, ${result.waiting} waiting`
    )
  }
  // Same chain checks for withdrawals staff marked as sent.
  const payouts = await CryptoPayoutService.confirmSent()
  if (payouts.completed > 0 || payouts.flagged > 0) {
    console.log(
      `[crypto] withdrawals: ${payouts.completed} completed, ${payouts.flagged} need staff attention`
    )
  }
  return { ...result, payouts }
}
