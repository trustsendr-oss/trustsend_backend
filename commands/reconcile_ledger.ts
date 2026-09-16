import { BaseCommand } from '@adonisjs/core/ace'
import { ReconciliationService } from '#services/ledger/reconciliation_service'

/**
 * Safety net against ledger/wallet drift (a bug or integrity violation, per
 * ReconciliationService's own doc comment) — previously written but never wired to anything:
 * no command, no cron entry, nothing ever called checkBalances()/checkTransactionBalance()
 * outside a manual REPL session. Mirrors mobile-money:reconcile's wiring pattern.
 *
 * Not run automatically by anything in this app — schedule it externally via cron, e.g. every
 * minute (ReconciliationService's own doc comment: "Runs frequently (every 60 seconds)"):
 * cd /path/to/app && node ace ledger:reconcile
 *
 * Exits non-zero when a mismatch is found so an external cron/alerting wrapper can page on it —
 * this is a compensating control, not a substitute for actually alerting (PagerDuty/Slack/etc.
 * still need to be wired to react to a non-zero exit or to the [CRITICAL] log lines).
 */
export default class ReconcileLedger extends BaseCommand {
  static commandName = 'ledger:reconcile'
  static description =
    'Detect drift between wallet balance_cache, ledger_entries, and per-transaction debit/credit balance'

  static options = {
    startApp: true,
  }

  async run() {
    const balanceMismatches = await ReconciliationService.checkBalances()
    const transactionImbalances = await ReconciliationService.checkTransactionBalance()

    if (balanceMismatches.length === 0) {
      this.logger.info('No wallet balance mismatches found')
    } else {
      this.logger.error(
        `${balanceMismatches.length} wallet balance mismatch(es) found — see [CRITICAL] lines above`
      )
    }

    if (transactionImbalances.length === 0) {
      this.logger.info('No unbalanced ledger transactions found')
    } else {
      this.logger.error(
        `${transactionImbalances.length} unbalanced ledger transaction(s) found — see [CRITICAL] lines above`
      )
    }

    if (balanceMismatches.length > 0 || transactionImbalances.length > 0) {
      this.exitCode = 1
    }
  }
}
