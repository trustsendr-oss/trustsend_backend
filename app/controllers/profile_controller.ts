import { readFile } from 'node:fs/promises'
import UserTransformer from '#transformers/user_transformer'
import type User from '#models/user'
import type { HttpContext } from '@adonisjs/core/http'
import {
  ALLOWED_AVATAR_EXTENSIONS,
  AvatarStorageService,
  InvalidAvatarException,
  MAX_AVATAR_SIZE_BYTES,
} from '#services/users/avatar_storage_service'

export default class ProfileController {
  async show({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail() as User
    return serialize(UserTransformer.transform(user))
  }

  /**
   * POST /api/v1/account/avatar — multipart, field `image`.
   * Replaces the current photo, if any. The new file is written and saved on the row before the
   * old one is deleted, so a failure midway never leaves the account pointing at nothing.
   */
  async updateAvatar({ auth, request, response, serialize }: HttpContext) {
    const user = auth.getUserOrFail() as User

    const file = request.file('image', {
      size: MAX_AVATAR_SIZE_BYTES,
      extnames: [...ALLOWED_AVATAR_EXTENSIONS],
    })
    if (!file) {
      return response.badRequest({ code: 'AVATAR_MISSING', message: 'No image was sent' })
    }

    try {
      if (!file.isValid) {
        throw new InvalidAvatarException(file.errors.map((error) => error.message).join(', '))
      }
      const { ref, mimeType } = await AvatarStorageService.store(await readFile(file.tmpPath!))

      const previous = user.avatarRef
      user.avatarRef = ref
      user.avatarMimeType = mimeType
      await user.save()
      if (previous) await AvatarStorageService.remove(previous)
    } catch (error) {
      if (error instanceof InvalidAvatarException) {
        return response.unprocessableEntity({ code: 'AVATAR_INVALID', message: error.message })
      }
      throw error
    }

    return serialize(UserTransformer.transform(user))
  }

  /** DELETE /api/v1/account/avatar — back to initials. Idempotent. */
  async destroyAvatar({ auth, serialize }: HttpContext) {
    const user = auth.getUserOrFail() as User

    const previous = user.avatarRef
    if (previous) {
      user.avatarRef = null
      user.avatarMimeType = null
      await user.save()
      await AvatarStorageService.remove(previous)
    }

    return serialize(UserTransformer.transform(user))
  }

  /**
   * GET /api/v1/account/avatar — the signed-in holder's own photo.
   * Served to its owner only, so the app loads it with its bearer token. The URL in the profile
   * carries a version taken from the file reference: a new photo gets a new URL, which is what
   * makes a long private cache safe.
   */
  async avatar({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    if (!user.avatarRef) {
      return response.notFound({ message: 'No profile photo' })
    }

    const bytes = await AvatarStorageService.retrieve(user.avatarRef)
    response.header('Content-Type', user.avatarMimeType ?? 'application/octet-stream')
    response.header('Cache-Control', 'private, max-age=86400')
    return response.send(bytes)
  }
}
