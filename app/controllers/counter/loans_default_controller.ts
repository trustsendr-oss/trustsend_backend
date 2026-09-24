import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Loan from '#models/loan'
import {
  DefaultManagementService,
  LoanDefaultException,
} from '#services/lending/default_management_service'
import { serializeLoan } from '#controllers/lending/serialize_loan'

const defaultValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(5).maxLength(1000),
    seize_collateral: vine.boolean().optional(),
  })
)

const DEFAULT_ROLES = new Set(['credit_officer', 'branch_manager', 'admin'])

export default class LoansDefaultController {
  /** POST /api/v1/counter/loans/:id/default */
  async markDefault({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!DEFAULT_ROLES.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only a credit officer, branch manager or admin can mark loans as defaulted.',
        code: 'E_NOT_AUTHORIZED',
      })
    }

    const { reason, seize_collateral } = await request.validateUsing(defaultValidator)
    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
      .first()

    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await DefaultManagementService.markDefault(
        loan,
        businessStaff,
        reason,
        correlationId,
        { seizeCollateral: seize_collateral }
      )

      return response.ok({ data: serializeLoan(loan) })
    } catch (error) {
      if (error instanceof LoanDefaultException) {
        return response.conflict({ message: error.message, code: 'E_DEFAULT_FAILED' })
      }
      throw error
    }
  }

  /** POST /api/v1/counter/loans/:id/seize-collateral */
  async seizeCollateral({ business, businessStaff, params, correlationId, response }: HttpContext) {
    if (!DEFAULT_ROLES.has(businessStaff.role)) {
      return response.forbidden({
        message: 'Only a credit officer, branch manager or admin can seize collateral.',
        code: 'E_NOT_AUTHORIZED',
      })
    }

    const loan = await Loan.query()
      .where('id', Number(params.id))
      .where('provider_id', business.id)
      .preload('product')
      .preload('borrower')
      .first()

    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      const result = await DefaultManagementService.seizeCollateral(loan, businessStaff, correlationId)
      return response.ok({
        data: {
          loan: serializeLoan(result.loan),
          amount_seized: result.amountSeized.toString(),
        },
      })
    } catch (error) {
      if (error instanceof LoanDefaultException) {
        return response.conflict({ message: error.message, code: 'E_SEIZURE_FAILED' })
      }
      throw error
    }
  }
}
