import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Business from '#models/business'
import { PinService } from '#services/security/pin_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { NotificationService } from '#services/notifications/notification_service'

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

/**
 * Business dashboard PIN — deliberately NOT reachable from the businessApiKey group. A PIN is
 * only meaningful for a human at a keyboard; an API key call already has its one credential
 * (the key itself, see business_api_key_middleware.ts) and gets no PIN prompt.
 */
export default class BusinessPinController {
  /**
   * POST /api/v1/business/dashboard/pin
   */
  async setPin({ business, request, correlationId, response }: HttpContext) {
    if (PinService.isPinSet(business)) {
      return response.badRequest({
        message: 'PIN already set. Use POST /business/dashboard/pin/change to update it.',
      })
    }

    const { pin } = await request.validateUsing(setPinValidator)
    await PinService.setPin(business, pin)

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.pin_set',
      resourceType: 'business',
      resourceId: business.id,
      before: { pin_set: false },
      after: { pin_set: true },
      correlationId,
    })

    return response.ok({ message: 'PIN set successfully' })
  }

  /**
   * POST /api/v1/business/dashboard/pin/change
   */
  async changePin({ business, request, correlationId, response }: HttpContext) {
    if (!PinService.isPinSet(business)) {
      return response.badRequest({
        message: 'No PIN set yet. Use POST /business/dashboard/pin to set one.',
      })
    }

    const { current_pin: currentPin, new_pin: newPin } =
      await request.validateUsing(changePinValidator)

    const verification = await PinService.verifyPin(business, currentPin)
    if (!verification.valid) {
      return response.unauthorized({
        message: verification.message,
        code: verification.code,
      })
    }

    await PinService.setPin(business, newPin)

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.pin_changed',
      resourceType: 'business',
      resourceId: business.id,
      before: undefined,
      after: undefined,
      correlationId,
    })

    return response.ok({ message: 'PIN changed successfully' })
  }

  /**
   * POST /api/v1/business/dashboard/pin/reset
   * Self-service "forgot my PIN" — step 1. Deliberately NOT reachable from the businessApiKey
   * group, same reasoning as setPin/changePin: a PIN is only meaningful for a human at a
   * keyboard. Public within the dashboard auth group (no session required) — same reasoning as
   * pin_controller.ts's User equivalent: a business locked out of its PIN has no other way to
   * identify itself except by email.
   */
  async requestReset({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(requestResetValidator)
    const genericResponse = {
      message: 'If an account exists for this email, a PIN reset link has been sent.',
    }

    const business = await Business.findBy('email', email)
    if (!business) {
      return response.ok(genericResponse)
    }

    const token = await PinService.requestReset(business)

    await NotificationService.sendEmail({
      to: business.email,
      subject: 'Réinitialisation du code de votre compte entreprise',
      template: 'pin_reset_requested',
      data: { token, expires_in_minutes: 30 },
    })

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.pin_reset_requested',
      resourceType: 'business',
      resourceId: business.id,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok(genericResponse)
  }

  /**
   * POST /api/v1/business/dashboard/pin/reset/confirm
   * Self-service "forgot my PIN" — step 2.
   */
  async confirmReset({ request, response }: HttpContext) {
    const { email, token, new_pin: newPin } = await request.validateUsing(confirmResetValidator)

    const business = await Business.findBy('email', email)
    if (!business) {
      return response.unauthorized({ message: 'Invalid or expired reset token' })
    }

    try {
      await PinService.confirmReset(business, token, newPin)
    } catch {
      return response.unauthorized({ message: 'Invalid or expired reset token' })
    }

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'business.pin_reset_confirmed',
      resourceType: 'business',
      resourceId: business.id,
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({ message: 'PIN reset successfully' })
  }
}
