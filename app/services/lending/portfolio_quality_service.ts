import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export interface LoanArrears {
  loanId: number
  daysOverdue: number
  amountOverdue: bigint
  principalOutstanding: bigint
}

export interface PortfolioQuality {
  providerId: number
  currencyCode: string
  /** Principal still owed across every outstanding loan — the denominator of every ratio below. */
  grossPortfolio: bigint
  loansOutstanding: number
  loansInArrears: number
  /** Outstanding principal of loans at least N days late, and that as a share of the portfolio. */
  par: Array<{ days: number; amount: bigint; ratioBps: number }>
}

const PAR_THRESHOLDS = [1, 30, 60, 90]

/**
 * Portfolio quality: who is late, by how long, and what share of the book that represents.
 *
 * ## Why PAR counts the whole loan
 *
 * Portfolio at risk is the outstanding PRINCIPAL of every loan with a payment overdue, not the
 * overdue instalments themselves. A borrower who has missed one payment of a twelve-month loan
 * puts the entire remaining balance at risk, not one twelfth of it — that is the whole point of
 * the measure, and computing it the intuitive way would flatter every book in the system by an
 * order of magnitude. PAR30 is the number a microfinance supervisor asks for first.
 *
 * ## Why it is computed, not stored
 *
 * It changes every midnight without anything happening: a loan crosses thirty days late because
 * time passed. A stored figure would be wrong by definition the moment after it was written. Daily
 * snapshots for trend reporting are a separate concern, and should record what was computed rather
 * than replace the computation.
 */
export class PortfolioQualityService {
  /** Every outstanding loan of this institution that has a payment past due. */
  static async arrearsFor(providerId: number, asOf = DateTime.now()): Promise<LoanArrears[]> {
    const loans = await Loan.query()
      .where('provider_id', providerId)
      .whereIn('status', ['disbursed', 'repaying'])

    const arrears: LoanArrears[] = []

    for (const loan of loans) {
      const overdue = await LoanSchedule.query()
        .where('loan_id', loan.id)
        .where('due_at', '<', asOf.toSQL()!)
        .orderBy('due_at', 'asc')

      let amountOverdue = 0n
      let oldestUnpaid: DateTime | null = null

      for (const line of overdue) {
        const remaining = line.total - line.paid
        if (remaining <= 0n) continue
        amountOverdue += remaining
        if (!oldestUnpaid) oldestUnpaid = line.dueAt
      }

      if (amountOverdue > 0n && oldestUnpaid) {
        arrears.push({
          loanId: loan.id,
          daysOverdue: Math.floor(asOf.diff(oldestUnpaid, 'days').days),
          amountOverdue,
          // The whole remaining principal is what is at risk, not the missed instalments.
          principalOutstanding: loan.principalOutstanding,
        })
      }
    }

    return arrears
  }

  static async reportFor(
    providerId: number,
    currencyCode = 'USD',
    asOf = DateTime.now()
  ): Promise<PortfolioQuality> {
    const loans = await Loan.query()
      .where('provider_id', providerId)
      .where('currency_code', currencyCode)
      .whereIn('status', ['disbursed', 'repaying'])

    const grossPortfolio = loans.reduce((sum, loan) => sum + loan.principalOutstanding, 0n)
    const arrears = await this.arrearsFor(providerId, asOf)
    const byLoan = new Map(arrears.map((a) => [a.loanId, a]))

    const par = PAR_THRESHOLDS.map((days) => {
      const amount = loans.reduce((sum, loan) => {
        const late = byLoan.get(loan.id)
        return late && late.daysOverdue >= days ? sum + loan.principalOutstanding : sum
      }, 0n)

      return {
        days,
        amount,
        // Basis points rather than a float, consistently with every other rate in this codebase.
        ratioBps: grossPortfolio > 0n ? Number((amount * 10_000n) / grossPortfolio) : 0,
      }
    })

    return {
      providerId,
      currencyCode,
      grossPortfolio,
      loansOutstanding: loans.length,
      loansInArrears: loans.filter((loan) => byLoan.has(loan.id)).length,
      par,
    }
  }

  /**
   * Moves loans past a threshold to `defaulted`.
   *
   * Deliberately a separate, deliberate act rather than something the arrears report does on the
   * way past: writing a loan off changes what an institution reports to its supervisor, and it
   * should happen because someone ran it with a policy in mind, not as a side effect of looking at
   * a number. Nothing is reversed and no money moves — recovery remains possible, and a defaulted
   * loan that is paid still settles.
   */
  static async markDefaults(
    providerId: number,
    afterDays: number,
    correlationId: string,
    asOf = DateTime.now()
  ): Promise<number> {
    const arrears = await this.arrearsFor(providerId, asOf)
    const due = arrears.filter((a) => a.daysOverdue >= afterDays)

    let marked = 0
    for (const entry of due) {
      const loan = await Loan.find(entry.loanId)
      if (!loan || loan.status === 'defaulted') continue

      const before = loan.status
      loan.status = 'defaulted'
      await loan.save()
      marked += 1

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'loan.defaulted',
        resourceType: 'loan',
        resourceId: loan.id,
        before: { status: before },
        after: {
          status: loan.status,
          days_overdue: entry.daysOverdue,
          principal_outstanding: loan.principalOutstanding.toString(),
        },
        correlationId,
      })
    }

    return marked
  }

  /** Institutions with an outstanding book, for a job that has to sweep all of them. */
  static async providersWithLoans(): Promise<number[]> {
    const rows = await db
      .from('loans')
      .whereIn('status', ['disbursed', 'repaying'])
      .distinct('provider_id')

    return rows.map((row) => row.provider_id)
  }
}
