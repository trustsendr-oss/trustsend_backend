import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Loan from '#models/loan'
import BusinessStaff from '#models/business_staff'
import { LoanOfficerPortfolioService } from '#services/lending/loan_officer_portfolio_service'
import { serializeLoan } from '#controllers/lending/serialize_loan'

/** Only credit officers and their superiors can manage credit portfolios. */
const PORTFOLIO_MANAGERS = new Set(['credit_officer', 'branch_manager', 'admin'])

const assignLoanValidator = vine.compile(
  vine.object({
    officer_id: vine.number().positive(),
  })
)

const assignBorrowerValidator = vine.compile(
  vine.object({
    officer_id: vine.number().positive(),
    user_id: vine.number().positive(),
  })
)

/**
 * Loan officer portfolio management — assignment and performance reporting.
 *
 * Branch managers and admins assign loans and borrowers to credit officers. Credit officers can
 * view their own portfolio stats. The PAR (Portfolio at Risk) metrics computed here are the
 * standard MFI indicators required by most prudential regulators.
 */
export default class LoanOfficersController {
  /**
   * GET /api/v1/counter/staff/:id/portfolio
   *
   * Returns the loan officer's active portfolio: list of loans, PAR30, PAR90 and recovery rate.
   * A credit officer can only read their own portfolio unless they're a branch manager or admin.
   */
  async portfolio({ business, businessStaff, params, response }: HttpContext) {
    const officerId = Number(params.id)

    // A credit officer can read their own stats; a manager/admin can read anyone's.
    if (
      businessStaff.role === 'credit_officer' &&
      officerId !== businessStaff.id
    ) {
      return response.forbidden({
        message: 'You can only view your own portfolio.',
        code: 'E_OWN_PORTFOLIO_ONLY',
      })
    }

    const officer = await BusinessStaff.query()
      .where('id', officerId)
      .where('business_id', business.id)
      .first()
    if (!officer) return response.notFound({ message: 'Staff member not found' })

    const stats = await LoanOfficerPortfolioService.getPortfolioStats(officer)
    return response.ok({ data: stats })
  }

  /**
   * POST /api/v1/counter/loans/:id/assign
   *
   * Assigns a specific loan to a credit officer. Typically done by a branch manager or admin
   * after a committee review, to ensure the follow-up is tracked against a named person.
   */
  async assignLoan({ business, businessStaff, params, request, response }: HttpContext) {
    if (!PORTFOLIO_MANAGERS.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only branch managers and admins can assign loans to officers.',
        code: 'E_NOT_A_MANAGER',
      })
    }

    const { officer_id } = await request.validateUsing(assignLoanValidator)

    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .first()
    if (!loan) return response.notFound({ message: 'Loan not found' })

    const officer = await BusinessStaff.query()
      .where('id', officer_id)
      .where('business_id', business.id)
      .first()
    if (!officer) return response.notFound({ message: 'Staff member not found' })

    await LoanOfficerPortfolioService.assignLoan(loan, officer)
    return response.ok({ data: serializeLoan(loan) })
  }

  /**
   * POST /api/v1/counter/borrowers/assign
   *
   * Assigns a borrower (user) to a credit officer as their responsible agent. All future loans
   * by this user within this institution will be automatically linked to the officer.
   */
  async assignBorrower({ business, businessStaff, request, response }: HttpContext) {
    if (!PORTFOLIO_MANAGERS.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only branch managers and admins can reassign borrowers.',
        code: 'E_NOT_A_MANAGER',
      })
    }

    const { officer_id, user_id } = await request.validateUsing(assignBorrowerValidator)

    const officer = await BusinessStaff.query()
      .where('id', officer_id)
      .where('business_id', business.id)
      .first()
    if (!officer) return response.notFound({ message: 'Staff member not found' })

    await LoanOfficerPortfolioService.assignBorrower(user_id, officer)
    return response.ok({ message: 'Borrower assigned to officer', officer_id, user_id })
  }
}
