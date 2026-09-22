import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * An institution's financial position, in the shape a microfinance return is assembled from.
 *
 * This prints the SUBSTRATE of a filing — deposits owed, portfolio held, arrears, liquidity, and
 * the movement over the window. It is not a completed BCC return: mapping these onto the
 * supervisor's own forms needs their templates and line numbering, and inventing a layout would be
 * worse than useless because somebody would submit it.
 *
 *   node ace imf:position IMF-KIVU
 *   node ace imf:position IMF-KIVU --currency=CDF --since=2026-01-01
 */
export default class ImfPosition extends BaseCommand {
  static commandName = 'imf:position'
  static description = "Print an institution's financial position for a reporting period"
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Institution code, e.g. IMF-KIVU' })
  declare code: string

  @flags.string({ description: 'Currency to report on', default: 'USD' })
  declare currency: string

  @flags.string({ description: 'Start of the reporting window, as YYYY-MM-DD' })
  declare since: string

  @flags.boolean({ description: 'Print raw JSON instead of a readable table' })
  declare json: boolean

  async run() {
    const { DateTime } = await import('luxon')
    type DateTime = import('luxon').DateTime
    const { default: Business } = await import('#models/business')
    const { RegulatoryReportService } =
      await import('#services/reporting/regulatory_report_service')

    const business = await Business.findBy('code', this.code.trim())
    if (!business) {
      this.logger.error(`No institution with code ${this.code}`)
      this.exitCode = 1
      return
    }

    let since: DateTime | undefined
    if (this.since) {
      const parsed = DateTime.fromISO(this.since)
      if (!parsed.isValid) {
        this.logger.error(`Invalid --since "${this.since}". Expected YYYY-MM-DD.`)
        this.exitCode = 1
        return
      }
      since = parsed
    }

    const report = await RegulatoryReportService.positionFor(
      business.id,
      this.currency.toUpperCase(),
      { since }
    )

    if (this.json) {
      // bigints do not survive JSON.stringify, so they leave as the digit strings they are
      // everywhere else in this codebase.
      this.logger.log(
        JSON.stringify(report, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      )
      return
    }

    const ccy = report.currencyCode
    this.logger.log('')
    this.logger.log(this.colors.bold(`${report.institution.name} (${report.institution.code})`))
    this.logger.log(`  as of ${report.asOf}  ·  ${ccy}`)

    this.logger.log('')
    this.logger.log(this.colors.bold('Deposits owed to savers'))
    this.logger.log(`  accounts   ${report.deposits.accounts}`)
    this.logger.log(`  savers     ${report.deposits.savers}`)
    this.logger.log(`  balance    ${report.deposits.balance} ${ccy}`)
    for (const line of report.deposits.byProduct) {
      this.logger.log(`    ${line.name}: ${line.accounts} account(s), ${line.balance}`)
    }

    this.logger.log('')
    this.logger.log(this.colors.bold('Loan portfolio'))
    this.logger.log(`  outstanding loans  ${report.loans.outstanding}`)
    this.logger.log(`  borrowers          ${report.loans.borrowers}`)
    this.logger.log(`  gross portfolio    ${report.loans.grossPortfolio} ${ccy}`)
    this.logger.log(`  interest accrued   ${report.loans.interestOutstanding}`)
    this.logger.log(`  penalties accrued  ${report.loans.penaltiesOutstanding}`)
    this.logger.log(
      `  defaulted          ${report.loans.defaulted.count} loan(s), ${report.loans.defaulted.principal}`
    )

    this.logger.log('')
    this.logger.log(this.colors.bold('Portfolio at risk'))
    for (const bucket of report.quality) {
      this.logger.log(
        `  PAR${bucket.days.toString().padEnd(3)} ${(bucket.ratioBps / 100).toFixed(2)}%  (${bucket.amount})`
      )
    }

    this.logger.log('')
    this.logger.log(this.colors.bold('Liquidity held on the platform'))
    this.logger.log(`  operating wallet  ${report.cash.operating} ${ccy}`)
    this.logger.log(`  counter floats    ${report.cash.branchFloats}`)
    this.logger.log(`  total             ${report.cash.total}`)

    this.logger.log('')
    this.logger.log(this.colors.bold(`Activity since ${report.activity.from}`))
    this.logger.log(
      `  disbursed          ${report.activity.disbursed} (${report.activity.disbursements})`
    )
    this.logger.log(
      `  repaid             ${report.activity.repaid} (${report.activity.repayments})`
    )
    this.logger.log(`  deposits taken     ${report.activity.depositsTaken}`)
    this.logger.log(`  withdrawals paid   ${report.activity.withdrawalsPaid}`)
    this.logger.log(`  interest to savers ${report.activity.interestPaidToSavers}`)

    this.logger.log('')
    this.logger.info(
      'These are the figures a microfinance return is assembled from, not a completed BCC form — mapping them onto the supervisor’s templates needs those templates.'
    )
  }
}
