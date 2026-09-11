import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { AuthCookieService, INTERNAL_ACCESS_COOKIE, INTERNAL_CSRF_COOKIE } from '#services/security/auth_cookie_service'
import vine from '@vinejs/vine'

const internalLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
})

const internalChangePasswordValidator = vine.create({
  current_password: vine.string(),
  new_password: vine.string().minLength(8),
})

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15

/**
 * Login for staff (support, compliance, finance, admin) — the 'internal' guard. Without this,
 * there was literally no way to obtain an InternalUser access token: every isInternalUser-gated
 * endpoint (agents, businesses, KYC, disputes) was unreachable regardless of any guard fix,
 * since no token could ever be minted in the first place.
 */
export default class InternalAuthController {
  /**
   * POST /api/v1/internal/auth/login
   *
   * This is the highest-privilege login in the system (support/compliance/finance/admin), so it
   * gets the same account lockout as the user and business dashboard logins — mirrors
   * access_tokens_controller.ts / business_dashboard/auth_controller.ts exactly.
   */
  async login(ctx: HttpContext) {
    const { request, response } = ctx
    const { email, password } = await request.validateUsing(internalLoginValidator)

    // Look the account up first so a lock can be enforced even before verifying the password
    // (verifyCredentials would otherwise happily keep re-checking the password forever).
    const existingUser = await InternalUser.findBy('email', email)
    if (existingUser?.loginLockedUntil && existingUser.loginLockedUntil > DateTime.now()) {
      const minutesLeft = Math.ceil(existingUser.loginLockedUntil.diffNow('minutes').minutes)
      return response.tooManyRequests({
        message: `Account locked for ${minutesLeft} more minutes due to too many failed login attempts`,
      })
    }

    let user: InternalUser
    try {
      user = await InternalUser.verifyCredentials(email, password)
    } catch (error) {
      if (existingUser) {
        existingUser.loginAttempts = (existingUser.loginAttempts || 0) + 1
        if (existingUser.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          existingUser.loginLockedUntil = DateTime.now().plus({ minutes: LOGIN_LOCKOUT_MINUTES })
        }
        await existingUser.save()
      }
      throw error
    }

    user.loginAttempts = 0
    user.loginLockedUntil = null

    if (user.status !== 'active') {
      await user.save()
      return response.forbidden({ message: `Account is ${user.status}` })
    }

    await user.save()

    const token = await InternalUser.accessTokens.create(user, ['*'], { expiresIn: '1h' })
    const csrfToken = AuthCookieService.setSession(
      ctx,
      INTERNAL_ACCESS_COOKIE,
      INTERNAL_CSRF_COOKIE,
      token.value!.release(),
      3600
    )

    return response.ok({
      data: {
        user: { id: user.id, email: user.email, full_name: user.fullName },
        csrf_token: csrfToken,
        expires_in: 3600,
        must_change_password: user.mustChangePassword,
      },
    })
  }

  /**
   * POST /api/v1/internal/auth/me — cheap session check for the admin panel's checkAuth(): the
   * access token now lives in an httpOnly cookie the frontend can't read, so it can no longer
   * tell "am I logged in" from local state alone and must ask the server.
   */
  async me({ auth, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    return response.ok({
      data: { id: user.id, email: user.email, full_name: user.fullName },
    })
  }

  /**
   * POST /api/v1/internal/auth/logout
   */
  async logout(ctx: HttpContext) {
    const { auth, response } = ctx
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    if (user.currentAccessToken) {
      await InternalUser.accessTokens.delete(user, user.currentAccessToken.identifier)
    }
    AuthCookieService.clearSession(ctx, INTERNAL_ACCESS_COOKIE, INTERNAL_CSRF_COOKIE)
    return response.ok({ message: 'Logged out successfully' })
  }

  /**
   * POST /api/v1/internal/auth/change-password
   * Self-service — pairs with InternalUserService.resetPassword()/create()'s
   * mustChangePassword flag, and mirrors business_dashboard/auth_controller.ts's own
   * changePassword exactly.
   */
  async changePassword({ auth, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { current_password: currentPassword, new_password: newPassword } =
      await request.validateUsing(internalChangePasswordValidator)

    try {
      await InternalUser.verifyCredentials(user.email, currentPassword)
    } catch {
      return response.unauthorized({ message: 'Current password is incorrect' })
    }

    user.password = newPassword
    user.mustChangePassword = false
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: user.id,
      action: 'internal_user.password_changed',
      resourceType: 'internal_user',
      resourceId: user.id,
      before: undefined,
      after: undefined,
      correlationId,
    })

    return response.ok({ message: 'Password changed successfully' })
  }
}
