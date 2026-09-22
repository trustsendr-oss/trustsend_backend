import { DateTime } from 'luxon'
import Loan from '#models/loan'
import LoanPenalty from '#models/loan_penalty'
import LoanSchedule from '#models/loan_schedule'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export interface PenaltyOutcome {
  loansConsidered: number
  loansCharged: number
  totalCharged: bigint
}

/**
 * Charging borrowers for being late.
 *
 * ## No money moves
 *
 * A penalty increases what is owed; it does not take anything from anybody. Nothing is posted to
 * the ledger here, and nothing can be: the borrower has not paid, which is the entire reason the
 * charge exists. It becomes a cash movement only when they settle it, through the ordinary
 * repayment path.
 *
 * ## Re-running is safe
 *
 * A (loan, period) row is written with the charge, so a retry or a duplicated cron charges nobody
 * twice — the same guarantee interest accrual relies on, for the same reason: unattended jobs fail
 * by repeating themselves, not by being slightly wrong.
 *
 * ## The grace period is honoured before anything else
 *
 * A borrower two days late on a product allowing five has not incurred anything, and a system that
 * fines them anyway teaches them the fine is unavoidable.
 */
export class PenaltyService {
  static periodKeyFor(moment: DateTime): string {
    return moment.toFormat('yyyy-MM')
  }

  /** Charges every eligible loan of every institution for one period. */
  static async runForPeriod(
    period: DateTime,
    correlationId: string,
    asOf = DateTime.now()
  ): Promise<PenaltyOutcome> {
    const periodKey = this.periodKeyFor(period)

    const loans = await Loan.query()
      .whereIn('status', ['disbursed', 'repaying', 'defaulted'])
      .whereNotNull('penalty_rate_bps')

    const outcome: PenaltyOutcome = {
      loansConsidered: loans.length,
      loansCharged: 0,
      totalCharged: 0n,
    }

    for (const loan of loans) {
      const charged = await this.chargeOne(loan, periodKey, correlationId, asOf)
      if (charged > 0n) {
        outcome.loansCharged += 1
        outcome.totalCharged += charged
      }
    }

    return outcome
  }

  /** One loan, one period. Returns what was charged, or zero. */
  static async chargeOne(
    loan: Loan,
    periodKey: string,
    correlationId: string,
    asOf = DateTime.now()
  ): Promise<bigint> {
    if (!loan.penaltyRateBps || !loan.penaltyBasis) return 0n

    const already = await LoanPenalty.query()
      .where('loan_id', loan.id)
      .where('period_key', periodKey)
      .first()
    if (already) return 0n

    const { overdueAmount, daysOverdue } = await this.arrearsOf(loan, asOf)
    if (overdueAmount <= 0n) return 0n
    if (daysOverdue <= loan.penaltyGraceDays) return 0n

    const basis = loan.penaltyBasis === 'overdue_amount' ? overdueAmount : loan.principalOutstanding
    const amount = (basis * BigInt(loan.penaltyRateBps) + 5000n) / 10000n
    if (amount === 0n) return 0n

    const penalty = new LoanPenalty()
    penalty.loanId = loan.id
    penalty.periodKey = periodKey
    penalty.basisAmount = basis
    penalty.rateBps = loan.penaltyRateBps
    penalty.daysOverdue = daysOverdue
    penalty.amount = amount
    penalty.chargedAt = asOf
    await penalty.save()

    loan.penaltiesOutstanding += amount
    await loan.save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'loan.penalty_charged',
      resourceType: 'loan',
      resourceId: loan.id,
      before: undefined,
      after: {
        period_key: periodKey,
        basis: loan.penaltyBasis,
        basis_amount: basis.toString(),
        days_overdue: daysOverdue,
        amount: amount.toString(),
      },
      correlationId,
    })

    return amount
  }

  /** What is past due on this loan, and since when. */
  private static async arrearsOf(
    loan: Loan,
    asOf: DateTime
  ): Promise<{ overdueAmount: bigint; daysOverdue: number }> {
    const lines = await LoanSchedule.query()
      .where('loan_id', loan.id)
      .where('due_at', '<', asOf.toSQL()!)
      .orderBy('due_at', 'asc')

    let overdueAmount = 0n
    let oldest: DateTime | null = null

    for (const line of lines) {
      const remaining = line.total - line.paid
      if (remaining <= 0n) continue
      overdueAmount += remaining
      if (!oldest) oldest = line.dueAt
    }

    return {
      overdueAmount,
      daysOverdue: oldest ? Math.floor(asOf.diff(oldest, 'days').days) : 0,
    }
  }
}
