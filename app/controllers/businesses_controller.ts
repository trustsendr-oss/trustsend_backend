import type { HttpContext } from '@adonisjs/core/http'
import Business from '#models/business'
import InternalUser from '#models/internal_user'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLifecycleService } from '#services/business/business_lifecycle_service'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'
import { PlanService, PlanNotFoundException } from '#services/business/plan_service'
import { IdGenerator } from '#services/security/id_generator'
import vine from '@vinejs/vine'

const assignPlanValidator = vine.create({ plan_id: vine.number().positive() })

const createBusinessValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255),
  email: vine.string().email().unique(async (db, value) => {
    const business = await db.from('businesses').where('email', value).first()
    return !business
  }),
  phone: vine.string().minLength(8).maxLength(20),
  code: vine
    .string()
    .minLength(2)
    .maxLength(20)
    .unique(async (db, value) => {
      const business = await db.from('businesses').where('code', value).first()
      return !business
    })
    .optional(),
  password: vine.string().minLength(8).optional(),
})

export default class BusinessesController {
  /**
   * GET /api/v1/businesses (admin only)
   */
  async index({ response }: HttpContext) {
    const businesses = await Business.query().preload('plan').select('*')

    return response.ok({
      data: businesses.map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        email: b.email,
        status: b.status,
        plan: b.plan ? { id: b.plan.id, code: b.plan.code, name: b.plan.name } : null,
        created_at: b.createdAt,
      })),
    })
  }

  /**
   * POST /api/v1/businesses (admin only)
   */
  async store({ request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createBusinessValidator)

    try {
      const { business, generatedPassword } = await BusinessOnboardingService.create({
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
          status: business.status,
          wallet_id: business.walletId,
          created_at: business.createdAt,
          ...(generatedPassword
            ? {
                generated_password: generatedPassword,
                message: 'Store this password now — it cannot be retrieved again.',
              }
            : {}),
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Business creation failed' })
    }
  }

  /**
   * GET /api/v1/businesses/:id (admin only)
   */
  async show({ params, response }: HttpContext) {
    const business = await Business.findOrFail(params.id)
    await business.load('plan')

    return response.ok({
      data: {
        id: business.id,
        code: business.code,
        name: business.name,
        email: business.email,
        phone: business.phone,
        status: business.status,
        wallet_id: business.walletId,
        webhook_url: business.webhookUrl,
        plan: business.plan
          ? { id: business.plan.id, code: business.plan.code, name: business.plan.name, features: business.plan.features }
          : null,
        created_at: business.createdAt,
        updated_at: business.updatedAt,
      },
    })
  }

  /**
   * POST /api/v1/businesses/:id/plan (admin only) — assign or change which pricing plan gates
   * this business's API access. Takes effect on the business's very next request.
   */
  async assignPlan({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { plan_id: planId } = await request.validateUsing(assignPlanValidator)

    try {
      const business = await PlanService.assignToBusiness(Number(params.id), planId, user.id, correlationId)
      await business.load('plan')
      return response.ok({
        data: { id: business.id, plan: { id: business.plan.id, code: business.plan.code, name: business.plan.name } },
      })
    } catch (error) {
      if (error instanceof PlanNotFoundException) {
        return response.notFound({ message: error.message })
      }
      const err = error as any
      return response.badRequest({ message: err.message || 'Plan assignment failed' })
    }
  }

  /**
   * POST /api/v1/businesses/:id/approve (admin only)
   */
  async approve({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const business = await Business.findOrFail(params.id)

    try {
      const updated = await BusinessLifecycleService.approve(business.id, user.id, correlationId)
      return response.ok({ data: { id: updated.id, status: updated.status, approved_by: user.id } })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Approval failed' })
    }
  }

  /**
   * POST /api/v1/businesses/:id/suspend (admin only)
   */
  async suspend({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const business = await Business.findOrFail(params.id)

    const suspendValidator = vine.create({ reason: vine.string().minLength(10).maxLength(255) })
    const { reason } = await request.validateUsing(suspendValidator)

    try {
      const updated = await BusinessLifecycleService.suspend(business.id, user.id, reason, correlationId)
      return response.ok({ data: { id: updated.id, status: updated.status, suspended_by: user.id } })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Suspension failed' })
    }
  }

  /**
   * POST /api/v1/businesses/:id/activate (admin only)
   */
  async activate({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const business = await Business.findOrFail(params.id)

    try {
      const updated = await BusinessLifecycleService.activate(business.id, user.id, correlationId)
      return response.ok({ data: { id: updated.id, status: updated.status, activated_by: user.id } })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Activation failed' })
    }
  }

  /**
   * POST /api/v1/businesses/:id/deactivate (admin only)
   */
  async deactivate({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const business = await Business.findOrFail(params.id)

    const terminateValidator = vine.create({ reason: vine.string().minLength(10).maxLength(255) })
    const { reason } = await request.validateUsing(terminateValidator)

    try {
      const updated = await BusinessLifecycleService.deactivate(business.id, user.id, reason, correlationId)
      return response.ok({ data: { id: updated.id, status: updated.status, terminated_by: user.id } })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Deactivation failed' })
    }
  }

  /**
   * POST /api/v1/businesses/:id/api-keys (admin only)
   * The full key is returned ONLY in this response — store it now, it can't be retrieved again.
   */
  async issueApiKey({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const business = await Business.findOrFail(params.id)

    if (business.status !== 'active') {
      return response.badRequest({ message: 'Business must be active to issue an API key' })
    }

    const { apiKey, keyId } = await BusinessApiKeyService.generate(business.id, user.id, correlationId)

    return response.created({
      data: {
        key_id: keyId,
        api_key: apiKey,
        message: 'Store this key now — it cannot be retrieved again. Only its hash is kept.',
      },
    })
  }

  /**
   * DELETE /api/v1/businesses/:id/api-keys/:keyId (admin only)
   */
  async revokeApiKey({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    await BusinessApiKeyService.revoke(Number(params.keyId), user.id, correlationId)
    return response.ok({ message: 'API key revoked' })
  }
}
