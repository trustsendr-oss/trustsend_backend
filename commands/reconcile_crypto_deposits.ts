import { BaseCommand } from '@adonisjs/core/ace'

/**
 * Manual run of the crypto deposit reconciliation. The queue worker schedules it every 15 minutes
 * (app/queue/workers.ts); this is for environments where the worker is not running, or to check
 * right away after a webhook incident. Recorded deposits are then credited by the next
 * confirmation pass, which this command also runs.
 */
export default class ReconcileCryptoDeposits extends BaseCommand {
  static commandName = 'crypto:reconcile'
  static description = 'Record stablecoin deposits that reached our addresses without a webhook'

  static options = {
    startApp: true,
  }

  async run() {
    const { CryptoReconciliationService } =
      await import('#services/crypto/crypto_reconciliation_service')
    const { CryptoDepositService } = await import('#services/crypto/crypto_deposit_service')

    const result = await CryptoReconciliationService.reconcile()
    this.logger.info(
      `Scanned ${result.addresses} address(es) on ${result.networks} network(s): ${result.missed} missed deposit(s) recorded`
    )
    if (result.failedNetworks.length) {
      this.logger.error(`Failed on ${result.failedNetworks.join(', ')} — retried on the next run`)
      this.exitCode = 1
    }

    const confirmed = await CryptoDepositService.confirmPending()
    this.logger.info(
      `Confirmation: ${confirmed.credited} credited, ${confirmed.rejected} rejected, ${confirmed.waiting} waiting`
    )
  }
}
