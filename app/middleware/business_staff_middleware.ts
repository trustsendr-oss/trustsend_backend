import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import User from '#models/user'
import type BusinessStaff from '#models/business_staff'
import {
  BusinessStaffIdentityService,
  CannotCoverCounterException,
  CounterNotFoundException,
} from '#services/business/business_staff_identity_service'

/**
 * Runs AFTER middleware.auth() has authenticated an ordinary user session, and resolves the
 * institution that user works for.
 *
 * This is the third way a request comes to act for a business, alongside an API key
 * (business_api_key_middleware.ts) and a dashboard login (business_dashboard_middleware.ts). All
 * three set the SAME `ctx.business`, deliberately: it is what lets middleware.businessPlan() and
 * middleware.businessActive() gate a counter route with no changes, and what lets the controllers
 * shared between access paths work for a teller without a line of staff-specific logic — the
 * reasoning business_dashboard_middleware.ts already spells out for its own path.
 *
 * `ctx.businessStaff` carries who the person is and which counter they are posted to, which
 * ctx.business alone cannot say. Scoped queries must filter on `ctx.business.id`, never on a
 * business id taken from the request: the membership row is the only trustworthy statement of
 * which institution this caller belongs to, and a teller reaching another institution's customers
 * would be a leak between direct competitors.
 */
export default class BusinessStaffMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user

    if (!(user instanceof User)) {
      return ctx.response.unauthorized({ message: 'Unauthenticated' })
    }

    const staff = await BusinessStaffIdentityService.findActiveStaffForUser(user.id)

    // One message for "not staff" and for "suspended staff" alike: which of the two it is says
    // something about the institution's roster that a caller who is neither has no business learning.
    if (!staff) {
      return ctx.response.forbidden({
        message: 'This account is not active staff of any institution.',
        code: 'E_NOT_INSTITUTION_STAFF',
      })
    }

    // A branch manager or an admin names the counter they are covering; anyone else may only
    // name their own. See BusinessStaffIdentityService.coverCounter.
    const requested = ctx.request.header('x-counter-id')
    if (requested !== undefined && requested !== '') {
      const counterId = Number(requested)
      if (!Number.isInteger(counterId) || counterId <= 0) {
        return ctx.response.badRequest({ message: 'Invalid X-Counter-Id', code: 'E_BAD_COUNTER' })
      }
      try {
        await BusinessStaffIdentityService.coverCounter(staff, counterId)
      } catch (error) {
        if (error instanceof CannotCoverCounterException) {
          return ctx.response.forbidden({ message: error.message, code: 'E_CANNOT_COVER' })
        }
        if (error instanceof CounterNotFoundException) {
          return ctx.response.notFound({ message: error.message, code: 'E_COUNTER_NOT_FOUND' })
        }
        throw error
      }
    }

    ctx.business = staff.business
    ctx.businessStaff = staff
    ctx.businessAuthMethod = 'staff'

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Set by business_staff_middleware.ts — who the caller is within ctx.business. */
    businessStaff: BusinessStaff
  }
}
