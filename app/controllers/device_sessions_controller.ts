import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import UserTransformer from '#transformers/user_transformer'
import { DeviceSessionService } from '#services/security/device_session_service'
import { PinService } from '#services/security/pin_service'

const enrollValidator = vine.create({
  platform: vine.enum(['ios', 'android']).optional(),
})

const pinLoginValidator = vine.create({
  device_token: vine.string().maxLength(128),
  pin: vine.string().regex(/^\d{4}$/),
})

const revokeValidator = vine.create({
  device_token: vine.string().maxLength(128),
})

/**
 * Sign-in with the payment PIN on a device that already signed in once with email + password.
 *
 * The PIN is verified here, server-side, with PinService's attempt counter and lockout — a
 * client-side PIN check would only be a screen in front of a token that works without it.
 */
export default class DeviceSessionsController {
  /**
   * POST /api/v1/account/device-sessions
   * Called by the app once signed in. Requires a PIN: a device session is useless without one.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const { platform } = await request.validateUsing(enrollValidator)

    if (!PinService.isPinSet(user)) {
      return response.badRequest({
        code: 'PIN_NOT_SET',
        message: 'Set a PIN before enabling PIN sign-in on this device.',
      })
    }

    const deviceToken = await DeviceSessionService.issue(user.id, platform ?? null)
    return response.created({ data: { deviceToken } })
  }

  /**
   * POST /api/v1/auth/pin-login — public, throttled.
   * Same response as /auth/login. A PIN lockout ends the device session: past that point the
   * device has to prove itself again with the password.
   */
  async pinLogin({ request, response, serialize }: HttpContext) {
    const { device_token: deviceToken, pin } = await request.validateUsing(pinLoginValidator)

    const session = await DeviceSessionService.find(deviceToken)
    const user = session ? await User.find(session.userId) : null
    if (!session || !user) {
      return response.unauthorized({
        code: 'DEVICE_SESSION_INVALID',
        message: 'This device is no longer signed in. Sign in with your password.',
      })
    }

    const verification = await PinService.verifyPin(user, pin)
    if (!verification.valid) {
      // This miss may itself have triggered the lockout; a past `pinLockedUntil` is a stale one.
      const lockedNow = !!user.pinLockedUntil && user.pinLockedUntil > DateTime.now()
      if (verification.code !== 'PIN_INVALID' || lockedNow) {
        await session.delete()
        return response.unauthorized({
          code: 'DEVICE_SESSION_INVALID',
          message:
            verification.code === 'PIN_NOT_SET'
              ? 'No PIN is set on this account. Sign in with your password.'
              : 'Too many incorrect PINs. Sign in with your password.',
        })
      }
      return response.unauthorized({ code: verification.code, message: verification.message })
    }

    await DeviceSessionService.touch(session)
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '1h' })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
      expiresIn: 3600,
    })
  }

  /**
   * POST /api/v1/auth/device-sessions/revoke — public: holding the token is the proof, and the
   * app must be able to forget a device whose access token has already expired.
   */
  async revoke({ request, response }: HttpContext) {
    const { device_token: deviceToken } = await request.validateUsing(revokeValidator)
    await DeviceSessionService.revoke(deviceToken)
    return response.noContent()
  }
}
