import { BaseCommand } from '@adonisjs/core/ace'
import { MobileMoneyReconciliationService } from '#services/mobile_money/mobile_money_reconciliation_service'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'

/**
 * Safety net for the async-payment double-write gap (see MobileMoneyReconciliationService).
 * Not run automatically by anything in this app — schedule it externally via cron, e.g. every
 * five minutes: cd /path/to/app && node ace mobile-money:reconcile
 */
export default class ReconcileMobileMoney extends BaseCommand {
  static commandName = 'mobile-money:reconcile'
  static description = 'Poll PawaPay for any deposit/payout stuck without a terminal local status'

  static options = {
    startApp: true,
  }

  async run() {
    const provider = new PawaPayProvider()
    const result = await MobileMoneyReconciliationService.sweep(provider)

    this.logger.info(
      `Checked ${result.checked}, healed ${result.healed}, marked failed ${result.markedFailed}, still pending ${result.stillPending}`
    )

    const drifts = await MobileMoneyReconciliationService.reconcileWalletBalances(provider)
    for (const drift of drifts) {
      if (drift.difference === '0') {
        this.logger.info(`Wallet balance OK for ${drift.currency}: ${drift.pawapayActualBalance}`)
      } else {
        this.logger.warning(
          `Wallet balance drift for ${drift.currency} (${drift.country}): PawaPay reports ${drift.pawapayActualBalance}, ` +
            `our ledger expects ${drift.ourClearingBalance} (difference ${drift.difference}). ` +
            `Could be an undocumented PawaPay fee or an un-ledgered top-up — verify against PawaPay's statement.`
        )
      }
    }
  }
}
