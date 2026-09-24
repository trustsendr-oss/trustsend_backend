import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Loan from '#models/loan'
import { LoanCommitteeService, LoanCommitteeException } from '#services/lending/loan_committee_service'
import { serializeLoan } from '#controllers/lending/serialize_loan'

/** Only credit officers, branch managers and institution admins sit on the committee. */
const COMMITTEE_ROLES = new Set(['credit_officer', 'branch_manager', 'admin'])

const submitValidator = vine.compile(vine.object({}))

const committeeApproveValidator = vine.compile(
  vine.object({
    /** Optional: committee may approve a smaller amount. Sent as string, parsed as bigint. */
    approved_principal: vine.string().optional(),
    notes: vine.string().trim().maxLength(2000).optional(),
  })
)

const committeeRejectValidator = vine.compile(
  vine.object({
    notes: vine.string().trim().minLength(10).maxLength(2000),
  })
)

/**
 * Credit committee endpoints — the multi-person approval circuit for IMF institutions.
 *
 * Three state transitions:
 *  1. POST /:id/submit           → requested → under_review
 *  2. POST /:id/committee-approve → under_review → committee_approved (status=approved)
 *  3. POST /:id/committee-reject  → under_review → rejected
 *
 * The `disburse` endpoint already exists on CounterLoansController and is unchanged —
 * after committee_approved the officer disburses using the existing flow.
 */
export default class LoansCommitteeController {
  /** POST /api/v1/counter/loans/:id/submit — credit officer queues file for committee review */
  async submit({ business, businessStaff, params, correlationId, response }: HttpContext) {
    if (!COMMITTEE_ROLES.has(businessStaff.role)) return this.notACommitteeMember(response)

    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanCommitteeService.submitForReview(loan, businessStaff, correlationId)
      return response.ok({ data: serializeLoan(loan) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/loans/:id/committee-approve — committee greenlights the file */
  async committeeApprove({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!COMMITTEE_ROLES.has(businessStaff.role)) return this.notACommitteeMember(response)

    const { approved_principal, notes } = await request.validateUsing(committeeApproveValidator)
    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      const parsedPrincipal = approved_principal ? BigInt(approved_principal) : undefined
      await LoanCommitteeService.approveByCommittee(loan, businessStaff, correlationId, {
        approvedPrincipal: parsedPrincipal,
        notes,
      })
      return response.ok({ data: serializeLoan(loan) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/loans/:id/committee-reject — committee declines the file */
  async committeeReject({ business, businessStaff, params, request, correlationId, response }: HttpContext) {
    if (!COMMITTEE_ROLES.has(businessStaff.role)) return this.notACommitteeMember(response)

    const { notes } = await request.validateUsing(committeeRejectValidator)
    const loan = await this.owned(business.id, params.id)
    if (!loan) return response.notFound({ message: 'Loan not found' })

    try {
      await LoanCommitteeService.rejectByCommittee(loan, businessStaff, notes, correlationId)
      return response.ok({ data: serializeLoan(loan) })
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

  private notACommitteeMember(response: HttpContext['response']) {
    return response.forbidden({
      message: 'Only a credit officer, branch manager or institution admin can sit on the committee.',
      code: 'E_NOT_A_COMMITTEE_MEMBER',
    })
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error
    if (err.name === 'LoanCommitteeException') {
      return response.conflict({ message: err.message, code: 'E_COMMITTEE_RULE' })
    }
    throw error
  }
}
