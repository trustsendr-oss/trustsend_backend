import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Loan from '#models/loan'
import LoanRestructuring from '#models/loan_restructuring'
import {
  LoanRestructuringService,
  LoanRestructuringException,
} from '#services/lending/loan_restructuring_service'
import { serializeLoan } from '#controllers/lending/serialize_loan'

const restructureValidator = vine.compile(
  vine.object({
    new_term_months: vine.number().min(1).max(120),
    new_interest_rate_bps: vine.number().min(0).max(10000).optional(),
    grace_period_months: vine.number().min(0).max(24).optional(),
    recapitalize_penalties: vine.boolean().optional(),
    reason: vine.string().trim().minLength(5).maxLength(1000),
  })
)

const RESTRUCTURE_ROLES = new Set(['credit_officer', 'branch_manager', 'admin'])

export default class LoansRestructureController {
  /** POST /api/v1/counter/loans/:id/restructure */
  async restructure({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!RESTRUCTURE_ROLES.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only a credit officer, branch manager or admin can restructure loans.',
        code: 'E_NOT_AUTHORIZED',
      })
    }

    const payload = await request.validateUsing(restructureValidator)
    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
      .first()

    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanRestructuringService.restructure(
        loan,
        businessStaff,
        {
          newTermMonths: payload.new_term_months,
          newInterestRateBps: payload.new_interest_rate_bps,
          gracePeriodMonths: payload.grace_period_months,
          recapitalizePenalties: payload.recapitalize_penalties,
          reason: payload.reason,
        },
        correlationId
      )

      await loan.load('schedule')
      return response.ok({ data: serializeLoan(loan, loan.schedule) })
    } catch (error) {
      if (error instanceof LoanRestructuringException) {
        return response.conflict({ message: error.message, code: 'E_RESTRUCTURE_FAILED' })
      }
      throw error
    }
  }

  /** GET /api/v1/counter/loans/:id/restructurings */
  async history({ business, params, response }: HttpContext) {
    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .first()

    if (!loan) return response.notFound({ message: 'Loan not found' })

    const history = await LoanRestructuring.query()
      .where('loan_id', loan.id)
      .preload('staff')
      .orderBy('restructured_at', 'desc')

    return response.ok({
      data: history.map((item) => ({
        id: item.id,
        loan_id: item.loanId,
        decided_by_staff_id: item.decidedByStaffId,
        decided_by: item.staff ? { id: item.staff.id, role: item.staff.role } : null,
        previous_principal_outstanding: item.previousPrincipalOutstanding.toString(),
        previous_interest_outstanding: item.previousInterestOutstanding.toString(),
        previous_term_months: item.previousTermMonths,
        previous_interest_rate_bps: item.previousInterestRateBps,
        new_principal_outstanding: item.newPrincipalOutstanding.toString(),
        new_term_months: item.newTermMonths,
        new_interest_rate_bps: item.newInterestRateBps,
        grace_period_months: item.gracePeriodMonths,
        reason: item.reason,
        restructured_at: item.restructuredAt,
      })),
    })
  }
}
