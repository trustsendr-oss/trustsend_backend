import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import User from '#models/user'
import Wallet from '#models/wallet'
import { BusinessStaffIdentityService } from '#services/business/business_staff_identity_service'
import {
  CounterEnrolmentService,
  PhoneAlreadyEnrolledException,
} from '#services/counter/counter_enrolment_service'
import { collectAndValidateKycDocuments } from '#services/security/kyc_submission_service'

const enrolValidator = vine.create({
  full_name: vine.string().minLength(2).maxLength(255),
  phone: vine.string().minLength(8).maxLength(20).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  currency_code: vine.string().fixedLength(3).optional(),
  verification_type: vine
    .enum(['identity', 'address', 'liveness', 'document', 'pep_screening'])
    .optional(),
})

const lookupValidator = vine.create({
  code: vine.string().regex(/^\d{9}$/),
})

/**
 * Enrolling and finding customers at a counter.
 *
 * Lookup is exact-match on the code the holder chooses to share, and returns the bare minimum
 * needed to confirm "yes, this is the right person" — the same restraint DirectoryController
 * applies, and for the same reason: a window that answered partial searches would be a way to
 * enumerate the account base, one query at a time.
 */
export default class CounterCustomersController {
  /**
   * POST /api/v1/counter/customers — multipart: the customer's details plus their papers.
   */
  async store({ businessStaff, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(enrolValidator)
    const verificationType = payload.verification_type ?? 'identity'

    const collected = await collectAndValidateKycDocuments(request, verificationType)
    if (!collected.ok) {
      return response.status(collected.status).send({ message: collected.message })
    }

    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const { user, wallet, kycId } = await CounterEnrolmentService.enrol(
        businessStaff,
        counter.id,
        {
          fullName: payload.full_name,
          phone: payload.phone,
          pin: payload.pin,
          currencyCode: (payload.currency_code ?? 'USD').toUpperCase(),
          documents: collected.files,
          verificationType,
        },
        correlationId
      )

      return response.created({
        data: {
          // The code is what the holder will quote at the window from now on, so it is the one
          // thing the teller has to read back to them before they leave.
          code: user.code,
          full_name: user.fullName,
          phone: user.phone,
          wallet: { id: wallet.id, currency_code: wallet.currencyCode },
          kyc: {
            id: kycId,
            status: 'pending',
            documents: collected.files.map((file) => file.type),
          },
        },
      })
    } catch (error) {
      if (error instanceof PhoneAlreadyEnrolledException) {
        return response.conflict({ message: error.message, code: 'E_PHONE_ENROLLED' })
      }
      const err = error as Error
      if (err.name === 'StaffNotPostedException' || err.name === 'CounterNotActiveException') {
        return response.forbidden({ message: err.message })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/counter/customers?code=123456789 — confirm who is standing at the window.
   */
  async show({ request, response }: HttpContext) {
    const { code } = await request.validateUsing(lookupValidator, { data: request.qs() })

    const customer = await User.findBy('code', code)
    if (!customer) {
      return response.notFound({ message: 'No customer with this code' })
    }

    const wallets = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', customer.id)
      .where('status', 'active')

    return response.ok({
      data: {
        code: customer.code,
        full_name: customer.fullName,
        initials: customer.initials,
        // Balances stay out: confirming an identity does not require disclosing what someone has,
        // and a teller has no reason to read it before the holder asks for something.
        currencies: wallets.map((wallet) => wallet.currencyCode),
      },
    })
  }
}
