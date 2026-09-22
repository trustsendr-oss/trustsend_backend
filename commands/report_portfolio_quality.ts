import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Portfolio at risk, per institution — the first number a microfinance supervisor asks for.
 *
 * PAR counts the whole outstanding principal of every loan with a payment overdue, not the overdue
 * instalments. One missed payment puts the entire remaining balance at risk, and reporting it the
 * intuitive way would flatter every book in the system by an order of magnitude.
 *
 * `--default-after` additionally moves loans past that many days to `defaulted`. It is off by
 * default and has to be asked for: writing loans off changes what an institution reports, so it
 * should happen because someone applied a policy, not as a side effect of reading a number.
 *
 *   node ace loans:portfolio-quality
 *   node ace loans:portfolio-quality --provider=12 --default-after=90
 */
export default class ReportPortfolioQuality extends BaseCommand {
  static commandName = 'loans:portfolio-quality'
  static description = 'Report portfolio at risk per institution, and optionally mark defaults'
  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Restrict to one institution id' })
  declare provider: number

  @flags.string({ description: 'Currency to report on', default: 'USD' })
  declare currency: string

  @flags.number({ description: 'Also mark loans this many days overdue as defaulted' })
  declare defaultAfter: number

  async run() {
    const { PortfolioQualityService } = await import('#services/lending/portfolio_quality_service')
    const { default: Business } = await import('#models/business')

    const providerIds = this.provider
      ? [this.provider]
      : await PortfolioQualityService.providersWithLoans()

    if (providerIds.length === 0) {
      this.logger.info('No institution has an outstanding book.')
      return
    }

    for (const providerId of providerIds) {
      const business = await Business.find(providerId)
      const report = await PortfolioQualityService.reportFor(
        providerId,
        this.currency.toUpperCase()
      )

      this.logger.log('')
      this.logger.log(this.colors.bold(business ? business.name : `Institution ${providerId}`))
      this.logger.log(`  gross portfolio   ${report.grossPortfolio} ${report.currencyCode}`)
      this.logger.log(`  loans outstanding ${report.loansOutstanding}`)
      this.logger.log(`  loans in arrears  ${report.loansInArrears}`)

      for (const bucket of report.par) {
        const percent = (bucket.ratioBps / 100).toFixed(2)
        this.logger.log(`  PAR${bucket.days.toString().padEnd(3)} ${percent}%  (${bucket.amount})`)
      }

      if (this.defaultAfter) {
        const marked = await PortfolioQualityService.markDefaults(
          providerId,
          this.defaultAfter,
          `portfolio-quality-${Date.now()}`
        )
        if (marked > 0) {
          this.logger.warning(`  ${marked} loan(s) marked defaulted past ${this.defaultAfter} days`)
        }
      }
    }
  }
}
