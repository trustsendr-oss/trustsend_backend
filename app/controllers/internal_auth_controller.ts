import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { AuthCookieService, INTERNAL_ACCESS_COOKIE, INTERNAL_CSRF_COOKIE } from '#services/security/auth_cookie_service'
import { CryptoService } from '#services/security/crypto_service'
import { TotpService } from '#services/security/totp_service'
import {
  INTERNAL_MFA_PENDING_ABILITY,
  hasFullInternalSession,
} from '#services/staff/internal_session_policy'
import vine from '@vinejs/vine'

const internalLoginValidator = vine.create({
  email: vine.string().email(),
  password: vine.string(),
})

const internalChangePasswordValidator = vine.create({
  current_password: vine.string(),
  new_password: vine.string().minLength(12).maxLength(128),
})

const mfaCodeValidator = vine.create({
  code: vine.string().trim().regex(/^\d{6}$/),
})

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15
const FULL_SESSION_SECONDS = 3600
const MFA_PENDING_SECONDS = 300

/**
 * Login for staff (support, compliance, finance, admin) — the 'internal' guard, the
 * highest-privilege access in the system.
 *
 * Sign-in is two-step whenever two-factor authentication is enabled: the password yields a
 * short-lived pending session that can only submit the TOTP code (verifyMfa); the code yields the
 * full session. Accounts that have not yet changed their temporary password or enrolled TOTP get a
 * full session but are held back by is_internal_user.ts until both are done (see me()).
 */
export default class InternalAuthController {
  /**
   * POST /api/v1/internal/auth/login
   */
  async login(ctx: HttpContext) {
    const { request, response } = ctx
    const { email, password } = await request.validateUsing(internalLoginValidator)

    // Look the account up first so a lock can be enforced even before verifying the password
    // (verifyCredentials would otherwise happily keep re-checking the password forever).
    const existingUser = await InternalUser.findBy('email', email)
    const lockedMinutes = existingUser ? this.lockedMinutesLeft(existingUser) : null
    if (lockedMinutes !== null) {
      return response.tooManyRequests({
        message: `Account locked for ${lockedMinutes} more minutes due to too many failed login attempts`,
      })
    }

    let user: InternalUser
    try {
      user = await InternalUser.verifyCredentials(email, password)
    } catch (error) {
      if (existingUser) {
        await this.registerFailedAttempt(existingUser)
      }
      throw error
    }

    if (user.status !== 'active') {
      return response.forbidden({ message: `Account is ${user.status}` })
    }

    if (user.mfaEnabled) {
      const token = await InternalUser.accessTokens.create(user, [INTERNAL_MFA_PENDING_ABILITY], {
        expiresIn: `${MFA_PENDING_SECONDS}s`,
      })
      const csrfToken = AuthCookieService.setSession(
        ctx,
        INTERNAL_ACCESS_COOKIE,
        INTERNAL_CSRF_COOKIE,
        token.value!.release(),
        MFA_PENDING_SECONDS
      )

      // Attempts are only cleared once the second factor succeeds, so the password alone never
      // resets the lockout counter that also guards TOTP guessing.
      return response.ok({
        data: { mfa_required: true, csrf_token: csrfToken, expires_in: MFA_PENDING_SECONDS },
      })
    }

    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    return response.ok({ data: await this.startFullSession(ctx, user) })
  }

  /**
   * POST /api/v1/internal/auth/mfa/verify — second step of a two-factor sign-in.
   */
  async verifyMfa(ctx: HttpContext) {
    const { auth, request, response } = ctx
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const pendingToken = user.currentAccessToken

    if (
      !pendingToken ||
      hasFullInternalSession(user) ||
      !pendingToken.allows(INTERNAL_MFA_PENDING_ABILITY) ||
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted
    ) {
      return response.badRequest({ message: 'No pending two-factor verification for this session' })
    }

    const lockedMinutes = this.lockedMinutesLeft(user)
    if (lockedMinutes !== null) {
      return response.tooManyRequests({
        message: `Account locked for ${lockedMinutes} more minutes due to too many failed attempts`,
      })
    }

    const { code } = await request.validateUsing(mfaCodeValidator)
    const step = TotpService.verify(CryptoService.decrypt(user.mfaSecretEncrypted), code, {
      lastUsedStep: user.mfaLastUsedStep,
    })

    if (step === null) {
      await this.registerFailedAttempt(user)
      return response.unauthorized({ message: 'Invalid verification code' })
    }

    user.mfaLastUsedStep = step
    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    await InternalUser.accessTokens.delete(user, pendingToken.identifier)

    return response.ok({ data: await this.startFullSession(ctx, user) })
  }

  /**
   * POST /api/v1/internal/auth/mfa/setup — starts TOTP enrolment: stores a new encrypted secret
   * (not yet active) and returns it once, for the authenticator app.
   */
  async setupMfa({ auth, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    if (!hasFullInternalSession(user)) {
      return response.forbidden({ code: 'MFA_REQUIRED', message: 'Two-factor verification required' })
    }
    if (user.mfaEnabled) {
      return response.badRequest({ message: 'Two-factor authentication is already enabled' })
    }

    const secret = TotpService.generateSecret()
    user.mfaSecretEncrypted = CryptoService.encrypt(secret)
    user.mfaLastUsedStep = null
    await user.save()

    return response.ok({
      data: { secret, otpauth_url: TotpService.otpauthUrl(user.email, secret) },
    })
  }

  /**
   * POST /api/v1/internal/auth/mfa/enable — confirms enrolment with a first valid code.
   */
  async enableMfa({ auth, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    if (!hasFullInternalSession(user)) {
      return response.forbidden({ code: 'MFA_REQUIRED', message: 'Two-factor verification required' })
    }
    if (user.mfaEnabled) {
      return response.badRequest({ message: 'Two-factor authentication is already enabled' })
    }
    if (!user.mfaSecretEncrypted) {
      return response.badRequest({ message: 'Start two-factor setup first' })
    }

    const lockedMinutes = this.lockedMinutesLeft(user)
    if (lockedMinutes !== null) {
      return response.tooManyRequests({
        message: `Account locked for ${lockedMinutes} more minutes due to too many failed attempts`,
      })
    }

    const { code } = await request.validateUsing(mfaCodeValidator)
    const step = TotpService.verify(CryptoService.decrypt(user.mfaSecretEncrypted), code)

    if (step === null) {
      await this.registerFailedAttempt(user)
      return response.unauthorized({ message: 'Invalid verification code' })
    }

    user.mfaEnabled = true
    user.mfaLastUsedStep = step
    user.loginAttempts = 0
    user.loginLockedUntil = null
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: user.id,
      action: 'internal_user.mfa_enabled',
      resourceType: 'internal_user',
      resourceId: user.id,
      before: undefined,
      after: undefined,
      correlationId,
    })

    return response.ok({ message: 'Two-factor authentication enabled' })
  }

  /**
   * GET /api/v1/internal/auth/me — session check for the admin panel's checkAuth(), including
   * what is still required before the console unlocks.
   */
  async me({ auth, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    return response.ok({
      data: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        must_change_password: user.mustChangePassword,
        mfa_enabled: user.mfaEnabled,
        mfa_pending: !hasFullInternalSession(user),
      },
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
   * Self-service — clears the mustChangePassword flag set by create()/resetPassword() and signs
   * out every other session of the account.
   */
  async changePassword({ auth, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    if (!hasFullInternalSession(user)) {
      return response.forbidden({ code: 'MFA_REQUIRED', message: 'Two-factor verification required' })
    }

    const { current_password: currentPassword, new_password: newPassword } =
      await request.validateUsing(internalChangePasswordValidator)

    try {
      await InternalUser.verifyCredentials(user.email, currentPassword)
    } catch {
      return response.unauthorized({ message: 'Current password is incorrect' })
    }

    if (newPassword === currentPassword) {
      return response.badRequest({ message: 'The new password must be different from the current one' })
    }

    user.password = newPassword
    user.mustChangePassword = false
    await user.save()

    const currentIdentifier = user.currentAccessToken?.identifier
    for (const token of await InternalUser.accessTokens.all(user)) {
      if (String(token.identifier) !== String(currentIdentifier)) {
        await InternalUser.accessTokens.delete(user, token.identifier)
      }
    }

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

  private async startFullSession(ctx: HttpContext, user: InternalUser) {
    const token = await InternalUser.accessTokens.create(user, ['*'], {
      expiresIn: `${FULL_SESSION_SECONDS}s`,
    })
    const csrfToken = AuthCookieService.setSession(
      ctx,
      INTERNAL_ACCESS_COOKIE,
      INTERNAL_CSRF_COOKIE,
      token.value!.release(),
      FULL_SESSION_SECONDS
    )

    return {
      user: { id: user.id, email: user.email, full_name: user.fullName },
      csrf_token: csrfToken,
      expires_in: FULL_SESSION_SECONDS,
      must_change_password: user.mustChangePassword,
      mfa_enabled: user.mfaEnabled,
      mfa_required: false,
    }
  }

  private lockedMinutesLeft(user: InternalUser): number | null {
    if (user.loginLockedUntil && user.loginLockedUntil > DateTime.now()) {
      return Math.ceil(user.loginLockedUntil.diffNow('minutes').minutes)
    }
    return null
  }

  private async registerFailedAttempt(user: InternalUser) {
    user.loginAttempts = (user.loginAttempts || 0) + 1
    if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.loginLockedUntil = DateTime.now().plus({ minutes: LOGIN_LOCKOUT_MINUTES })
    }
    await user.save()
  }
}
