import { BaseCommand } from '@adonisjs/core/ace'
import { REMITTANCE_TTL_DAYS } from '#services/remittances/remittance_service'

/** Manual run of the remittance expiry sweep (the queue worker schedules it hourly). */
export default class ExpireRemittances extends BaseCommand {
  static commandName = 'remittance:expire'
  static description = `Refund transfers not collected within ${REMITTANCE_TTL_DAYS} days`

  static options = {
    startApp: true,
  }

  async run() {
    const { handleExpireRemittances } = await import('#jobs/expire_remittances_job')
    const { expired } = await handleExpireRemittances()
    this.logger.info(`Refunded ${expired} expired transfer${expired === 1 ? '' : 's'}`)
  }
}
