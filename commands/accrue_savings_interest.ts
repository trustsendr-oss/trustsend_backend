import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Pays savers the interest their accounts earned over a calendar month.
 *
 * Safe to re-run: a unique (account, period) row is written in the same transaction as each
 * posting, so a retry, a duplicated cron or an operator running last night's job again pays
 * nothing twice. That guarantee is the reason this can be scheduled at all.
 *
 * Defaults to the month just ended, because that is what a job run at the start of a month is
 * almost always for. `--period` settles any month explicitly, which is how a missed run is caught
 * up without inventing an "arrears mode".
 *
 *   node ace savings:accrue-interest
 *   node ace savings:accrue-interest --period=2026-08
 */
export default class AccrueSavingsInterest extends BaseCommand {
  static commandName = 'savings:accrue-interest'
  static description = "Pay one month's interest on every savings account"
  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Month to settle, as YYYY-MM. Defaults to the month just ended' })
  declare period: string

  @flags.boolean({ description: 'Report what would be paid without posting anything' })
  declare dryRun: boolean

  async run() {
    const { DateTime } = await import('luxon')
    const { InterestAccrualService } = await import('#services/savings/interest_accrual_service')
    const { default: SavingsAccount } = await import('#models/savings_account')
    const { default: InterestAccrual } = await import('#models/interest_accrual')

    const period = this.period
      ? DateTime.fromFormat(this.period, 'yyyy-MM')
      : DateTime.now().minus({ months: 1 })

    if (!period.isValid) {
      this.logger.error(`Invalid --period "${this.period}". Expected YYYY-MM, e.g. 2026-08.`)
      this.exitCode = 1
      return
    }
    if (period.startOf('month') > DateTime.now().startOf('month')) {
      // A month that has not finished has no minimum balance yet.
      this.logger.error('Cannot settle a period that has not ended')
      this.exitCode = 1
      return
    }

    const periodKey = InterestAccrualService.periodKeyFor(period)

    if (this.dryRun) {
      const eligible = await SavingsAccount.query()
        .whereIn('status', ['active', 'matured'])
        .where('opened_at', '<=', period.endOf('month').toSQL()!)
      const settled = await InterestAccrual.query().where('period_key', periodKey)

      this.logger.info(`Period ${periodKey}`)
      this.logger.info(`  accounts eligible  ${eligible.length}`)
      this.logger.info(`  already settled    ${settled.length}`)
      this.logger.info(`  would consider     ${eligible.length - settled.length}`)
      return
    }

    const outcome = await InterestAccrualService.runForPeriod(period, `accrue-${periodKey}`)

    this.logger.success(`Period ${periodKey} settled`)
    this.logger.log(`  considered  ${outcome.accountsConsidered}`)
    this.logger.log(`  paid        ${outcome.accountsPaid}`)
    this.logger.log(`  nothing due ${outcome.accountsSkipped}`)
    this.logger.log(`  total paid  ${outcome.totalPaid}`)

    if (outcome.failures.length > 0) {
      // Not swallowed: an institution that cannot honour its own rate is something a supervisor
      // has to see, and the run continues so one failure never blocks every other saver.
      this.logger.error(`${outcome.failures.length} account(s) could not be paid:`)
      for (const failure of outcome.failures) {
        this.logger.error(`  account ${failure.savingsAccountId}: ${failure.reason}`)
      }
      this.exitCode = 1
    }
  }
}
