import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Pulls the international exchange rates. Swap quotes already refresh stale rates on demand;
 * schedule this externally (e.g. hourly cron) to keep them warm:
 *   node ace fx:refresh-rates
 */
export default class RefreshExchangeRates extends BaseCommand {
  static commandName = 'fx:refresh-rates'
  static description = 'Refresh market exchange rates from the international feed'
  static options: CommandOptions = { startApp: true }

  async run() {
    const { ExchangeRateService } = await import('#services/fx/exchange_rate_service')
    try {
      const { updated } = await ExchangeRateService.refreshMarketRates()
      this.logger.success(`${updated} exchange rates updated from ${ExchangeRateService.feedUrl()}`)
    } catch (error) {
      this.logger.error((error as Error).message)
      this.exitCode = 1
    }
  }
}
