import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type BusinessStaff from '#models/business_staff'
import Loan from '#models/loan'
import LoanRestructuring from '#models/loan_restructuring'
import LoanSchedule from '#models/loan_schedule'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { buildSchedule, scheduleTotals } from '#services/lending/amortisation'

export class LoanRestructuringException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoanRestructuringException'
  }
}

export interface RestructureOptions {
  newTermMonths: number
  newInterestRateBps?: number
  gracePeriodMonths?: number
  recapitalizePenalties?: boolean
  reason: string
}

/**
 * Debt restructuring service for microfinance institutions.
 *
 * Renegotiates loan agreements to prevent default or recover distressed assets:
 *  - Tenor extension (increasing term_months)
 *  - Interest rate reduction
 *  - Grace period implementation
 *  - Recalculation and rebuilding of repayment schedule
 *  - Full regulatory audit trail in loan_restructurings
 */
export class LoanRestructuringService {
  /**
   * Restructures an outstanding or defaulted loan.
   */
  static async restructure(
    loan: Loan,
    staff: BusinessStaff,
    options: RestructureOptions,
    correlationId: string
  ): Promise<Loan> {
    if (!loan.isOutstanding) {
      throw new LoanRestructuringException(
        `Only active or defaulted loans can be restructured; this loan is '${loan.status}'`
      )
    }

    if (options.newTermMonths <= 0) {
      throw new LoanRestructuringException('New term must be greater than zero months')
    }

    if (!options.reason || options.reason.trim().length < 5) {
      throw new LoanRestructuringException('A valid justification/reason is required for regulatory compliance')
    }

    return db.transaction(async (trx) => {
      const prevPrincipal = loan.principalOutstanding
      const prevInterest = loan.interestOutstanding
      const prevTermMonths = loan.termMonths
      const prevRateBps = loan.interestRateBps

      const newRateBps = options.newInterestRateBps ?? loan.interestRateBps
      const gracePeriod = options.gracePeriodMonths ?? 0

      // Calculate new balance to amortize
      let principalToAmortize = prevPrincipal
      if (options.recapitalizePenalties && loan.penaltiesOutstanding > 0n) {
        principalToAmortize += loan.penaltiesOutstanding
        loan.penaltiesOutstanding = 0n
      }

      // Delete old unpaid schedule lines
      await LoanSchedule.query({ client: trx })
        .where('loan_id', loan.id)
        .where('paid', 0n)
        .delete()

      // Adjust any partially paid lines as settled up to now
      const partiallyPaid = await LoanSchedule.query({ client: trx })
        .where('loan_id', loan.id)
        .where('paid', '>', 0n)
        .whereNull('settled_at')

      for (const line of partiallyPaid) {
        line.settledAt = DateTime.now()
        await line.useTransaction(trx).save()
      }

      // Determine starting installment index
      const maxInstallmentRow = await LoanSchedule.query({ client: trx })
        .where('loan_id', loan.id)
        .max('installment as max_inst')
        .first()

      const startInstallment = (maxInstallmentRow?.$extras.max_inst ?? 0) + 1

      // Build new schedule lines starting after grace period
      const firstDueAt = DateTime.now().plus({ months: 1 + gracePeriod })
      const newLines = buildSchedule({
        principal: principalToAmortize,
        rateBps: newRateBps,
        period: loan.interestPeriod,
        termMonths: options.newTermMonths,
        method: loan.interestMethod,
        firstDueAt,
      })

      // Insert new schedule lines
      let currentInstNum = startInstallment
      for (const line of newLines) {
        const row = new LoanSchedule()
        row.loanId = loan.id
        row.installment = currentInstNum++
        row.dueAt = line.dueAt
        row.principal = line.principal
        row.interest = line.interest
        row.paid = 0n
        await row.useTransaction(trx).save()
      }

      const totals = scheduleTotals(newLines)

      // Update loan state
      loan.principalOutstanding = totals.principal
      loan.interestOutstanding = totals.interest
      loan.termMonths = options.newTermMonths
      loan.interestRateBps = newRateBps
      loan.isRestructured = true
      loan.restructureCount += 1
      loan.restructuredAt = DateTime.now()
      loan.status = 'repaying' // Restructuring restores loan to active repayment
      if (loan.stage === 'rejected' || loan.stage === null) {
        loan.stage = 'committee_approved'
      }
      await loan.useTransaction(trx).save()

      // Record restructuring audit record
      const restructuring = new LoanRestructuring()
      restructuring.loanId = loan.id
      restructuring.decidedByStaffId = staff.id
      restructuring.previousPrincipalOutstanding = prevPrincipal
      restructuring.previousInterestOutstanding = prevInterest
      restructuring.previousTermMonths = prevTermMonths
      restructuring.previousInterestRateBps = prevRateBps
      restructuring.newPrincipalOutstanding = totals.principal
      restructuring.newTermMonths = options.newTermMonths
      restructuring.newInterestRateBps = newRateBps
      restructuring.gracePeriodMonths = gracePeriod
      restructuring.reason = options.reason
      restructuring.restructuredAt = DateTime.now()
      await restructuring.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: staff.id,
        action: 'loan.restructured',
        resourceType: 'loan',
        resourceId: loan.id,
        before: {
          principal_outstanding: prevPrincipal.toString(),
          term_months: prevTermMonths,
          rate_bps: prevRateBps,
        },
        after: {
          principal_outstanding: totals.principal.toString(),
          term_months: options.newTermMonths,
          rate_bps: newRateBps,
          grace_period_months: gracePeriod,
          reason: options.reason,
        },
        correlationId,
        trx,
      })

      return loan
    })
  }
}
