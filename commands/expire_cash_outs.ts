import { BaseCommand } from '@adonisjs/core/ace'
import { CASH_OUT_RESERVATION_TTL_MINUTES } from '#services/transactions/cash_out_hold_service'

/**
 * Manual run of the cash-out expiry sweep. The queue worker schedules the same job every minute
 * (app/queue/workers.ts); this is for environments where the worker is not running.
 */
export default class ExpireCashOuts extends BaseCommand {
  static commandName = 'cash-out:expire'
  static description = `Cancel cash-out reservations older than ${CASH_OUT_RESERVATION_TTL_MINUTES} minutes`

  static options = {
    startApp: true,
  }

  async run() {
    const { handleExpireCashOuts } = await import('#jobs/expire_cash_outs_job')
    const { expired } = await handleExpireCashOuts()
    this.logger.info(`Expired ${expired} cash-out reservation${expired === 1 ? '' : 's'}`)
  }
}
