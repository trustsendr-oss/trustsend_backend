import type { HttpContext } from '@adonisjs/core/http'
import Loan from '#models/loan'
import LoanPenalty from '#models/loan_penalty'
import LoanRepayment from '#models/loan_repayment'
import LoanSchedule from '#models/loan_schedule'
import SavingsAccount from '#models/savings_account'
import { RegulatoryReportService } from '#services/reporting/regulatory_report_service'

/**
 * TumaPlus oversight of what partner institutions lend and hold — internal_user only.
 *
 * Deliberately read-only. Whether a particular borrower gets credit is the institution's decision,
 * taken by its own credit officer under its own policy; TumaPlus operates the system and answers
 * for the money moving correctly, not for who deserves a loan. Putting an "approve" button in this
 * back-office would quietly transfer that judgement — and the liability that follows it — to the
 * wrong party.
 *
 * What TumaPlus does need is the ability to see a book it is holding the money for: a portfolio
 * turning bad, an institution lending beyond its means, a borrower disputing a balance.
 *
 * Returns the full collection like the other back-office endpoints, which the admin data provider
 * filters and sorts client-side.
 */
export default class AdminLendingController {
  /** GET /api/v1/admin/loans */
  async loans({ request, response }: HttpContext) {
    const status = request.input('status')
    const providerId = request.input('provider_id')

    const query = Loan.query().preload('provider').preload('borrower').preload('product')
    if (status) query.where('status', String(status))
    if (providerId) query.where('provider_id', Number(providerId))

    const loans = await query.orderBy('requested_at', 'desc').limit(1000)

    return response.ok({ data: loans.map((loan) => this.serializeLoan(loan)) })
  }

  /** GET /api/v1/admin/loans/:id — with everything needed to answer a dispute. */
  async loan({ params, response }: HttpContext) {
    const loan = await Loan.query()
      .where('id', params.id)
      .preload('provider')
      .preload('borrower')
      .preload('product')
      .first()

    if (!loan) return response.notFound({ message: 'Loan not found' })

    const [schedule, repayments, penalties] = await Promise.all([
      LoanSchedule.query().where('loan_id', loan.id).orderBy('installment', 'asc'),
      LoanRepayment.query().where('loan_id', loan.id).orderBy('paid_at', 'asc'),
      LoanPenalty.query().where('loan_id', loan.id).orderBy('period_key', 'asc'),
    ])

    return response.ok({
      data: {
        ...this.serializeLoan(loan),
        schedule: schedule.map((line) => ({
          installment: line.installment,
          due_at: line.dueAt,
          principal: line.principal.toString(),
          interest: line.interest.toString(),
          total: line.total.toString(),
          paid: line.paid.toString(),
          remaining: line.remaining.toString(),
          overdue: line.isOverdue,
          settled_at: line.settledAt,
        })),
        // Each payment's split, as recorded at the time — never re-derived from today's rule.
        repayments: repayments.map((payment) => ({
          id: payment.id,
          amount: payment.amount.toString(),
          applied_to_penalties: payment.appliedToPenalties.toString(),
          applied_to_interest: payment.appliedToInterest.toString(),
          applied_to_principal: payment.appliedToPrincipal.toString(),
          ledger_transaction_id: payment.ledgerTransactionId,
          paid_at: payment.paidAt,
        })),
        penalties: penalties.map((penalty) => ({
          period_key: penalty.periodKey,
          basis_amount: penalty.basisAmount.toString(),
          rate_bps: penalty.rateBps,
          days_overdue: penalty.daysOverdue,
          amount: penalty.amount.toString(),
          charged_at: penalty.chargedAt,
        })),
      },
    })
  }

  /** GET /api/v1/admin/savings */
  async savings({ request, response }: HttpContext) {
    const status = request.input('status')
    const providerId = request.input('provider_id')

    const query = SavingsAccount.query()
      .preload('provider')
      .preload('saver')
      .preload('product')
      .preload('wallet')
    if (status) query.where('status', String(status))
    if (providerId) query.where('provider_id', Number(providerId))

    const accounts = await query.orderBy('opened_at', 'desc').limit(1000)

    return response.ok({
      data: accounts.map((account) => ({
        id: account.id,
        provider_id: account.providerId,
        provider_name: account.provider?.name ?? null,
        saver_name: account.saver?.fullName ?? account.saver?.code ?? null,
        product_name: account.product?.name ?? null,
        currency_code: account.currencyCode,
        balance: account.wallet?.balanceCache.toString() ?? '0',
        status: account.status,
        withdrawable: account.isWithdrawable,
        interest_rate_percent: account.interestRateBps / 100,
        interest_period: account.interestPeriod,
        opened_at: account.openedAt,
        matures_at: account.maturesAt,
      })),
    })
  }

  /**
   * GET /api/v1/admin/institutions/:id/position — the figures a microfinance return is assembled
   * from. Not a completed supervisory form; see RegulatoryReportService.
   */
  async position({ params, request, response }: HttpContext) {
    const currency = String(request.input('currency', 'USD')).toUpperCase()

    const report = await RegulatoryReportService.positionFor(Number(params.id), currency)

    // bigints do not survive JSON.stringify, so they leave as the digit strings used everywhere.
    return response.ok({
      data: JSON.parse(
        JSON.stringify(report, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      ),
    })
  }

  private serializeLoan(loan: Loan) {
    return {
      id: loan.id,
      status: loan.status,
      provider_id: loan.providerId,
      provider_name: loan.provider?.name ?? null,
      borrower_name: loan.borrower?.fullName ?? loan.borrower?.code ?? null,
      borrower_code: loan.borrower?.code ?? null,
      product_name: loan.product?.name ?? null,
      currency_code: loan.currencyCode,
      principal: loan.principal.toString(),
      principal_outstanding: loan.principalOutstanding.toString(),
      interest_outstanding: loan.interestOutstanding.toString(),
      penalties_outstanding: loan.penaltiesOutstanding.toString(),
      total_outstanding: loan.totalOutstanding.toString(),
      fees_charged: loan.feesCharged.toString(),
      // The terms this borrower agreed to, which may differ from the product's terms today.
      interest_rate_percent: loan.interestRateBps / 100,
      interest_period: loan.interestPeriod,
      interest_method: loan.interestMethod,
      term_months: loan.termMonths,
      penalty_rate_percent: loan.penaltyRateBps === null ? null : loan.penaltyRateBps / 100,
      penalty_basis: loan.penaltyBasis,
      requested_at: loan.requestedAt,
      decided_at: loan.decidedAt,
      decision_notes: loan.decisionNotes,
      disbursed_at: loan.disbursedAt,
      closed_at: loan.closedAt,
      disbursement_transaction_id: loan.disbursementTransactionId,
    }
  }
}
