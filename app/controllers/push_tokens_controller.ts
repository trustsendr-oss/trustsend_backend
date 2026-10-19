import vine from '@vinejs/vine'
import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import { PushService } from '#services/notifications/push_service'

/** Expo's token format: ExponentPushToken[…] (older SDKs) or ExpoPushToken[…]. */
const token = () =>
  vine
    .string()
    .maxLength(255)
    .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/)

const registerValidator = vine.create({
  token: token(),
  platform: vine.enum(['ios', 'android']),
})

const unregisterValidator = vine.create({
  token: token(),
})

export default class PushTokensController {
  /** POST /api/v1/account/push-tokens — called by the app after each sign-in. Idempotent. */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(registerValidator)
    await PushService.register(user.id, payload.token, payload.platform)
    return response.noContent()
  }

  /** DELETE /api/v1/account/push-tokens — called by the app before signing out. */
  async destroy({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(unregisterValidator)
    await PushService.unregister(user.id, payload.token)
    return response.noContent()
  }
}
