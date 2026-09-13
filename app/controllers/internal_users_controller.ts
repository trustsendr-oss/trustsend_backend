import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'
import {
  InternalUserService,
  InternalUserNotFoundException,
  CannotModifySelfException,
} from '#services/staff/internal_user_service'
import vine from '@vinejs/vine'

const createInternalUserValidator = vine.create({
  email: vine.string().email().unique(async (db, value) => {
    const user = await db.from('internal_users').where('email', value).first()
    return !user
  }),
  full_name: vine.string().minLength(2).maxLength(255),
  password: vine.string().minLength(12).maxLength(128).optional(),
})

const reasonValidator = vine.create({ reason: vine.string().minLength(10).maxLength(255) })

/**
 * Admin management of staff (internal_user) accounts — who can log in as an admin at all. See
 * InternalUserService for why this exists: previously the only way to create one was direct DB
 * access, since internal_auth_controller.ts only ever provided login/logout.
 */
export default class InternalUsersController {
  /** GET /api/v1/internal-users (admin only) */
  async index({ response }: HttpContext) {
    const users = await InternalUserService.list()
    return response.ok({
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        status: u.status,
        must_change_password: u.mustChangePassword,
        mfa_enabled: u.mfaEnabled,
        created_at: u.createdAt,
      })),
    })
  }

  /** GET /api/v1/internal-users/:id (admin only) */
  async show({ params, response }: HttpContext) {
    try {
      const user = await InternalUserService.findByIdOrFail(Number(params.id))
      return response.ok({
        data: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          status: user.status,
          must_change_password: user.mustChangePassword,
          mfa_enabled: user.mfaEnabled,
          created_at: user.createdAt,
          updated_at: user.updatedAt,
        },
      })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /**
   * POST /api/v1/internal-users (admin only)
   * The generated password (if any) is returned ONLY in this response — store it now.
   */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(createInternalUserValidator)

    const { user, generatedPassword } = await InternalUserService.create(
      { email: payload.email, fullName: payload.full_name, password: payload.password },
      actor.id,
      correlationId
    )

    return response.created({
      data: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        status: user.status,
        ...(generatedPassword
          ? {
              generated_password: generatedPassword,
              message: 'Store this password now — it cannot be retrieved again.',
            }
          : {}),
      },
    })
  }

  /** POST /api/v1/internal-users/:id/activate (admin only) */
  async activate({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    try {
      const user = await InternalUserService.activate(Number(params.id), actor.id, correlationId)
      return response.ok({ data: { id: user.id, status: user.status } })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/internal-users/:id/suspend (admin only) */
  async suspend({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)

    try {
      const user = await InternalUserService.suspend(Number(params.id), actor.id, reason, correlationId)
      return response.ok({ data: { id: user.id, status: user.status } })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof CannotModifySelfException) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/internal-users/:id/deactivate (admin only) */
  async deactivate({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)

    try {
      const user = await InternalUserService.deactivate(Number(params.id), actor.id, reason, correlationId)
      return response.ok({ data: { id: user.id, status: user.status } })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof CannotModifySelfException) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
  }

  /**
   * POST /api/v1/internal-users/:id/reset-password (admin only)
   * The new password is returned ONLY in this response — store it now.
   */
  async resetPassword({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser

    try {
      const newPassword = await InternalUserService.resetPassword(Number(params.id), actor.id, correlationId)
      return response.ok({
        data: {
          new_password: newPassword,
          message: 'Store this password now — it cannot be retrieved again. The user must change it on next login.',
        },
      })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
  /**
   * POST /api/v1/internal-users/:id/reset-mfa (admin only)
   * Clears the account's TOTP enrolment and signs it out; it must enrol again on next sign-in.
   */
  async resetMfa({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser

    try {
      const user = await InternalUserService.resetMfa(Number(params.id), actor.id, correlationId)
      return response.ok({ data: { id: user.id, mfa_enabled: user.mfaEnabled } })
    } catch (error) {
      if (error instanceof InternalUserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof CannotModifySelfException) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
  }
}
