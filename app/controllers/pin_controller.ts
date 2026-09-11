import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { PinService } from '#services/security/pin_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { NotificationService } from '#services/notifications/notification_service'
import vine from '@vinejs/vine'

const setPinValidator = vine.create({
  pin: vine.string().regex(/^\d{4}$/),
})

const changePinValidator = vine.create({
  current_pin: vine.string().regex(/^\d{4}$/),
  new_pin: vine.string().regex(/^\d{4}$/),
})

const requestResetValidator = vine.create({
  email: vine.string().email(),
})

const confirmResetValidator = vine.create({
  email: vine.string().email(),
  token: vine.string(),
  new_pin: vine.string().regex(/^\d{4}$/),
})

export default class PinController {
  /**
   * POST /api/v1/account/pin
   * Set the PIN for the first time. Use /account/pin/change once a PIN already exists.
   */
  async setPin({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User

    if (PinService.isPinSet(user)) {
      return response.badRequest({
        message: 'PIN already set.',
      })
    }

    const { pin } = await request.validateUsing(setPinValidator)
    await PinService.setPin(user, pin)

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'pin.set',
      resourceType: 'user',
      resourceId: user.id,
      before: { pin_set: false },
      after: { pin_set: true },
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({ message: 'PIN set successfully' })
  }

  /**
   * POST /api/v1/account/pin/change
   * Change an existing PIN — requires the current PIN.
   */
  async changePin({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User

    if (!PinService.isPinSet(user)) {
      return response.badRequest({
        message: 'No PIN set yet. Use POST /account/pin to set one.',
      })
    }

    const { current_pin: currentPin, new_pin: newPin } =
      await request.validateUsing(changePinValidator)

    const verification = await PinService.verifyPin(user, currentPin)
    if (!verification.valid) {
      return response.unauthorized({
        message: verification.message,
        code: verification.code,
      })
    }

    await PinService.setPin(user, newPin)

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'pin.changed',
      resourceType: 'user',
      resourceId: user.id,
      before: undefined,
      after: undefined,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({ message: 'PIN changed successfully' })
  }

  /**
   * POST /api/v1/account/pin/reset
   * Self-service "forgot my PIN" — step 1. Public (no auth): a user who is locked out of
   * transactions has no other way to identify themselves except by email, same as a standard
   * "forgot password" flow. Always returns the same generic message whether or not the email
   * matches an account — confirming/denying account existence here would be a user-enumeration
   * leak.
   */
  async requestReset({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(requestResetValidator)
    const genericResponse = {
      message: 'If an account exists for this email, a PIN reset link has been sent.',
    }

    const user = await User.findBy('email', email)
    if (!user) {
      return response.ok(genericResponse)
    }

    const token = await PinService.requestReset(user)

    // Delivered out of band on purpose: the token is the credential for step 2, so it must not
    // travel in this response. sendEmail() goes through @adonisjs/mail over SMTP (config/mail.ts)
    // and swallows its own failures — a delivery problem must not change the generic response
    // below, which is what keeps this endpoint from confirming whether the account exists.
    await NotificationService.sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre code de paiement',
      template: 'pin_reset_requested',
      data: { token, expires_in_minutes: 30 },
    })

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'pin.reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok(genericResponse)
  }

  /**
   * POST /api/v1/account/pin/reset/confirm
   * Self-service "forgot my PIN" — step 2. Public (no auth): the token itself is the credential.
   */
  async confirmReset({ request, response }: HttpContext) {
    const { email, token, new_pin: newPin } = await request.validateUsing(confirmResetValidator)

    // Same response whether the email is unknown or the token is wrong: distinguishing them
    // would confirm which addresses have accounts. `code` lets a client tell this apart from a
    // dead session — this route is public, a 401 here never means "log back in".
    const invalidToken = {
      message: 'Invalid or expired reset token',
      code: 'RESET_TOKEN_INVALID',
    }

    const user = await User.findBy('email', email)
    if (!user) {
      return response.unauthorized(invalidToken)
    }

    try {
      await PinService.confirmReset(user, token, newPin)
    } catch {
      return response.unauthorized(invalidToken)
    }

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'pin.reset_confirmed',
      resourceType: 'user',
      resourceId: user.id,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({ message: 'PIN reset successfully' })
  }
}
