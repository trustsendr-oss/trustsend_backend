import { CryptoReconciliationService } from '#services/crypto/crypto_reconciliation_service'

/**
 * Re-scans recently shown deposit addresses for stablecoin transfers no webhook reported. The
 * deposits it finds are credited by the confirmation job like any other. Scheduled in
 * app/queue/workers.ts; `node ace crypto:reconcile` runs it by hand.
 */
export async function handleCryptoReconciliation() {
  const result = await CryptoReconciliationService.reconcile()
  if (result.missed > 0 || result.failedNetworks.length > 0) {
    console.log(
      `[crypto] reconciliation: ${result.missed} missed deposit(s) recorded over ${result.addresses} address(es)` +
        (result.failedNetworks.length ? `, failed on ${result.failedNetworks.join(', ')}` : '')
    )
  }
  return result
}
