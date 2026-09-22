import type { HttpContext } from '@adonisjs/core/http'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import { LoanService } from '#services/lending/loan_service'
import { rejectLoanValidator } from '#validators/loans'
import { serializeLoan } from '#controllers/lending/serialize_loan'

/** Deciding on credit is a credit officer's job; a teller has no business doing it. */
const DECIDERS = new Set(['credit_officer', 'branch_manager', 'admin'])

/**
 * An institution's loan book, for its credit officers.
 *
 * Every query is scoped to ctx.business, so a competitor's book does not exist here. Approval,
 * refusal and disbursement are separate acts on purpose: saying yes and handing over the money are
 * different decisions, often taken on different days and sometimes by different people, and
 * collapsing them would lose the record of which one happened.
 */
export default class CounterLoansController {
  /** GET /api/v1/counter/loans */
  async index({ business, request, response }: HttpContext) {
    const status = request.input('status')

    const query = Loan.query()
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
    if (status) query.where('status', String(status))

    // Applications first: this is a decision queue before it is a portfolio.
    const loans = await query
      .orderByRaw(`CASE WHEN status = 'requested' THEN 0 ELSE 1 END`)
      .orderBy('requested_at', 'asc')
      .limit(500)

    return response.ok({
      data: loans.map((loan) => ({
        ...serializeLoan(loan),
        borrower: loan.borrower
          ? { code: loan.borrower.code, full_name: loan.borrower.fullName }
          : null,
      })),
    })
  }

  /** GET /api/v1/counter/loans/:id */
  async show({ business, params, response }: HttpContext) {
    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    const schedule = await LoanSchedule.query()
      .where('loan_id', loan.id)
      .orderBy('installment', 'asc')

    return response.ok({ data: serializeLoan(loan, schedule) })
  }

  /** POST /api/v1/counter/loans/:id/approve */
  async approve({ business, businessStaff, params, correlationId, response }: HttpContext) {
    if (!DECIDERS.has(businessStaff.role)) return this.notADecider(response)

    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanService.approve(loan, businessStaff, correlationId)
      return response.ok({ data: serializeLoan(loan) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/loans/:id/reject */
  async reject({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!DECIDERS.has(businessStaff.role)) return this.notADecider(response)

    const { notes } = await request.validateUsing(rejectLoanValidator)
    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanService.reject(loan, businessStaff, notes, correlationId)
      return response.ok({ data: serializeLoan(loan) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/loans/:id/disburse — the money actually leaves. */
  async disburse({ business, businessStaff, params, correlationId, response }: HttpContext) {
    if (!DECIDERS.has(businessStaff.role)) return this.notADecider(response)

    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanService.disburse(loan, correlationId)
      const schedule = await LoanSchedule.query()
        .where('loan_id', loan.id)
        .orderBy('installment', 'asc')
      return response.ok({ data: serializeLoan(loan, schedule) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private owned(businessId: number, id: string) {
    return Loan.query()
      .where('id', Number(id))
      .where('provider_id', businessId)
      .preload('product')
      .preload('borrower')
      .first()
  }

  private notADecider(response: HttpContext['response']) {
    return response.forbidden({
      message: 'Only a credit officer, branch manager or institution admin can decide on credit.',
      code: 'E_NOT_A_CREDIT_OFFICER',
    })
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error
    switch (err.name) {
      case 'LoanStateException':
        return response.conflict({ message: err.message, code: 'E_LOAN_STATE' })
      case 'LenderFundsException':
        return response.conflict({ message: err.message, code: 'E_LENDER_FUNDS' })
      case 'LoanAmountException':
      case 'LoanProductException':
        return response.badRequest({ message: err.message })
      default:
        throw error
    }
  }
}
