import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import Loan from '#models/loan'
import LoanSchedule from '#models/loan_schedule'
import { LoanService } from '#services/lending/loan_service'
import { PinService } from '#services/security/pin_service'
import { requestLoanValidator, repayLoanValidator } from '#validators/loans'
import { serializeLoan } from '#controllers/lending/serialize_loan'

/**
 * A borrower's own credit, from the app.
 *
 * Every route resolves the loan by id AND by the signed-in user, so somebody else's file simply
 * does not exist here. That matters more than usual on the repayment route: without it, an id
 * would be enough to pay down a stranger's loan out of your own wallet.
 */
export default class BorrowerLoansController {
  /** GET /api/v1/finance/loans */
  async index({ auth, response }: HttpContext) {
    const user = auth.user as User

    const loans = await Loan.query()
      .where('user_id', user.id)
      .preload('product')
      .preload('provider')
      .orderBy('requested_at', 'desc')

    return response.ok({ data: loans.map((loan) => serializeLoan(loan)) })
  }

  /** GET /api/v1/finance/loans/:id — with the repayment schedule. */
  async show({ auth, params, response }: HttpContext) {
    const loan = await this.owned(auth.user as User, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    const schedule = await LoanSchedule.query()
      .where('loan_id', loan.id)
      .orderBy('installment', 'asc')

    return response.ok({ data: serializeLoan(loan, schedule) })
  }

  /** POST /api/v1/finance/loans — apply. */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    const payload = await request.validateUsing(requestLoanValidator)

    const pinCheck = await PinService.verifyPin(user, payload.pin)
    if (!pinCheck.valid) {
      return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
    }

    try {
      const loan = await LoanService.request(
        user.id,
        payload.product_id,
        BigInt(payload.amount),
        correlationId
      )
      await loan.load('product')
      await loan.load('provider')
      return response.created({ data: serializeLoan(loan) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/finance/loans/:id/repay */
  async repay({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    const payload = await request.validateUsing(repayLoanValidator)

    const loan = await this.owned(user, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    const pinCheck = await PinService.verifyPin(user, payload.pin)
    if (!pinCheck.valid) {
      return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
    }

    try {
      await LoanService.repay(loan, BigInt(payload.amount), correlationId)
      const schedule = await LoanSchedule.query()
        .where('loan_id', loan.id)
        .orderBy('installment', 'asc')
      return response.ok({ data: serializeLoan(loan, schedule) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private owned(user: User, id: string) {
    return Loan.query()
      .where('id', Number(id))
      .where('user_id', user.id)
      .preload('product')
      .preload('provider')
      .first()
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error
    switch (err.name) {
      case 'LoanProductException':
      case 'LoanAmountException':
        return response.badRequest({ message: err.message })
      case 'LoanStateException':
        return response.conflict({ message: err.message, code: 'E_LOAN_STATE' })
      case 'LenderFundsException':
        return response.conflict({ message: err.message, code: 'E_LENDER_FUNDS' })
      default:
        if (err.message?.includes('balance would go negative')) {
          return response.paymentRequired({ message: 'Insufficient balance' })
        }
        throw error
    }
  }
}
