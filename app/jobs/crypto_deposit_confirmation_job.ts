import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'

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
  return result
}
