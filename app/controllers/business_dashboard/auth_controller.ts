import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import Business from '#models/business'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import {
  AuthCookieService,
  BUSINESS_ACCESS_COOKIE,
  BUSINESS_CSRF_COOKIE,
} from '#services/security/auth_cookie_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessSignupOtpService } from '#services/business/business_signup_otp_service'
import { NotificationService } from '#services/notifications/notification_service'
import { IdGenerator } from '#services/security/id_generator'
import { SandboxMode } from '#services/sandbox/sandbox_mode'
import {
  requestBusinessSignupOtpValidator,
  businessSignupValidator,
  businessLoginValidator,
  businessChangePasswordValidator,
} from '#validators/business_dashboard'

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_LOCKOUT_MINUTES = 15

/**
 * Dashboard login for a Business (human, email+password) — distinct from the API key used for
 * server-to-server calls. Mirrors access_tokens_controller.ts's lockout mechanism exactly.
 */
export default class BusinessDashboardAuthController {
  async requestSignupOtp({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(requestBusinessSignupOtpValidator)

    const existing = await Business.findBy('email', email)
    if (existing) {
      return response.badRequest({
        message: 'An account already exists for this email. Try logging in instead.',
      })
    }

    const otp = await BusinessSignupOtpService.requestOtp(email)

    await NotificationService.sendEmail({
      to: email,
      subject: 'Vérifiez votre adresse e-mail — inscription entreprise',
      template: 'business_signup_otp',
      data: { otp, expires_in_minutes: 10 },
    })

    return response.ok({
      message:
        'Verification code sent. Check your email, then complete signup with POST /business/auth/signup.',
    })
  }

  /**
   * POST /api/v1/business/auth/signup
   * Step 2 of signup: the full payload plus the code from step 1. Public, self-service — anyone
   * can call this (no admin/auth required), unlike POST /api/v1/businesses which stays
   * admin-only. The business starts in pending_approval and CAN log in (see login() below) — it
   * needs a session to submit its KYC in the first place — but business_active_middleware.ts
   * blocks every money-moving/credential-issuing route until an admin approves both its KYC and
   * the business itself.
   */
  async signup({ request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(businessSignupValidator)

    try {
      await BusinessSignupOtpService.verifyAndConsume(payload.email, payload.otp)
    } catch (error) {
      const err = error as any
      if (err.name === 'InvalidOtpException') {
        return response.badRequest({ message: err.message })
      }
      throw error
    }

    const { business } = await BusinessOnboardingService.create({
      code: payload.code || IdGenerator.generateId('BIZ'),
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      correlationId,
    })

    return response.created({
      data: {
        id: business.id,
        code: business.code,
        name: business.name,
        email: business.email,
        status: business.status,
        message: SandboxMode.isEnabled()
          ? 'Sandbox account created and active. Log in to generate a sandbox API key — no KYC or approval needed.'
          : 'Account created. You can log in now to submit your KYC verification, but deposits, payouts, and API keys require admin approval first.',
      },
    })
  }

  /**
   * POST /api/v1/business/auth/login
   */
  async login(ctx: HttpContext) {
    const { request, response } = ctx
    const { email, password } = await request.validateUsing(businessLoginValidator)

    const existingBusiness = await Business.findBy('email', email)
    if (existingBusiness?.loginLockedUntil && existingBusiness.loginLockedUntil > DateTime.now()) {
      const minutesLeft = Math.ceil(existingBusiness.loginLockedUntil.diffNow('minutes').minutes)
      return response.tooManyRequests({
        message: `Account locked for ${minutesLeft} more minutes due to too many failed login attempts`,
      })
    }

    if (!existingBusiness?.password) {
      // Never reveal whether the email exists — same generic failure as a wrong password.
      return response.unauthorized({ message: 'Invalid credentials' })
    }

    // pending_approval is allowed to log in — it needs a session to submit its KYC and check
    // its status (business_active_middleware.ts blocks it from anything financial in the
    // meantime). suspended/terminated are still hard-blocked.
    if (existingBusiness.status === 'suspended' || existingBusiness.status === 'terminated') {
      return response.forbidden({ message: `Business account is ${existingBusiness.status}` })
    }

    let business: Business
    try {
      business = await Business.verifyCredentials(email, password)
    } catch (error) {
      existingBusiness.loginAttempts = (existingBusiness.loginAttempts || 0) + 1
      if (existingBusiness.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        existingBusiness.loginLockedUntil = DateTime.now().plus({ minutes: LOGIN_LOCKOUT_MINUTES })
      }
      await existingBusiness.save()
      throw error
    }

    business.loginAttempts = 0
    business.loginLockedUntil = null
    await business.save()

    const token = await Business.accessTokens.create(business, ['*'], { expiresIn: '1h' })
    const csrfToken = AuthCookieService.setSession(
      ctx,
      BUSINESS_ACCESS_COOKIE,
      BUSINESS_CSRF_COOKIE,
      token.value!.release(),
      3600
    )

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.dashboard_login',
      resourceType: 'business',
      resourceId: business.id,
      before: undefined,
      after: undefined,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({
      data: {
        business: {
          id: business.id,
          code: business.code,
          name: business.name,
          email: business.email,
        },
        csrf_token: csrfToken,
        expires_in: 3600,
      },
    })
  }

  /**
   * POST /api/v1/business/auth/refresh
   */
  async refresh(ctx: HttpContext) {
    const { business, response } = ctx
    if (!business.currentAccessToken) {
      return response.badRequest({ message: 'No current token found' })
    }

    const newToken = await Business.accessTokens.create(business, ['*'], { expiresIn: '1h' })
    await Business.accessTokens.delete(business, business.currentAccessToken.identifier)
    const csrfToken = AuthCookieService.setSession(
      ctx,
      BUSINESS_ACCESS_COOKIE,
      BUSINESS_CSRF_COOKIE,
      newToken.value!.release(),
      3600
    )

    return response.ok({
      data: {
        csrf_token: csrfToken,
        expires_in: 3600,
      },
    })
  }

  /**
   * POST /api/v1/business/auth/logout
   */
  async logout(ctx: HttpContext) {
    const { business, response } = ctx
    if (business.currentAccessToken) {
      await Business.accessTokens.delete(business, business.currentAccessToken.identifier)
    }
    AuthCookieService.clearSession(ctx, BUSINESS_ACCESS_COOKIE, BUSINESS_CSRF_COOKIE)
    return response.ok({ message: 'Logged out successfully' })
  }

  /**
   * POST /api/v1/business/auth/change-password
   */
  async changePassword({ business, request, response }: HttpContext) {
    const { current_password: currentPassword, new_password: newPassword } =
      await request.validateUsing(businessChangePasswordValidator)

    try {
      await Business.verifyCredentials(business.email, currentPassword)
    } catch {
      return response.unauthorized({ message: 'Current password is incorrect' })
    }

    business.password = newPassword
    await business.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.password_changed',
      resourceType: 'business',
      resourceId: business.id,
      before: undefined,
      after: undefined,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({ message: 'Password changed successfully' })
  }
}
