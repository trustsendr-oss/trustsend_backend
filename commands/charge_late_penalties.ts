import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Charges late penalties for a calendar month, on every loan whose product defines one.
 *
 * Safe to re-run: a unique (loan, period) row is written with each charge, so a retry or a
 * duplicated cron charges nobody twice. Nothing is posted to the ledger — a penalty increases what
 * is owed, it does not take anything from anybody, and it becomes a cash movement only when the
 * borrower settles it.
 *
 *   node ace loans:charge-penalties
 *   node ace loans:charge-penalties --period=2026-08
 */
export default class ChargeLatePenalties extends BaseCommand {
  static commandName = 'loans:charge-penalties'
  static description = 'Charge one month of late penalties on overdue loans'
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Month to charge, as YYYY-MM. Defaults to the month just ended' })
  declare period: string

  @flags.boolean({ description: 'Report what would be charged without writing anything' })
  declare dryRun: boolean

  async run() {
    const { DateTime } = await import('luxon')
    const { PenaltyService } = await import('#services/lending/penalty_service')
    const { default: Loan } = await import('#models/loan')
    const { default: LoanPenalty } = await import('#models/loan_penalty')

    const period = this.period
      ? DateTime.fromFormat(this.period, 'yyyy-MM')
      : DateTime.now().minus({ months: 1 })

    if (!period.isValid) {
      this.logger.error(`Invalid --period "${this.period}". Expected YYYY-MM, e.g. 2026-08.`)
      this.exitCode = 1
      return
    }

    const periodKey = PenaltyService.periodKeyFor(period)

    if (this.dryRun) {
      const eligible = await Loan.query()
        .whereIn('status', ['disbursed', 'repaying', 'defaulted'])
        .whereNotNull('penalty_rate_bps')
      const charged = await LoanPenalty.query().where('period_key', periodKey)

      this.logger.info(`Period ${periodKey}`)
      this.logger.info(`  loans with a penalty clause  ${eligible.length}`)
      this.logger.info(`  already charged              ${charged.length}`)
      return
    }

    const outcome = await PenaltyService.runForPeriod(period, `penalties-${periodKey}`)

    this.logger.success(`Period ${periodKey} charged`)
    this.logger.log(`  considered     ${outcome.loansConsidered}`)
    this.logger.log(`  charged        ${outcome.loansCharged}`)
    this.logger.log(`  total charged  ${outcome.totalCharged}`)
  }
}
