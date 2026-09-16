import type { HttpContext } from '@adonisjs/core/http'
import type InternalUser from '#models/internal_user'
import {
  PlanService,
  PlanNotFoundException,
  PlanCodeTakenException,
  InvalidPlanFeaturesException,
} from '#services/business/plan_service'
import vine from '@vinejs/vine'

// price/maintenance_price as strings (not numbers) — same convention as mobile money amounts
// (see validators/mobile_money.ts): these are bigint smallest-unit values, and a JS number can't
// carry that precision safely.
const moneyAmount = vine.string().regex(/^(0|[1-9]\d*)$/)

// `features` is `Record<string, true | { currencies?: string[]; countries?: string[] }>` — a
// union at the record-value level vine's schema builder doesn't have a clean shape for, so this
// only checks the outer container is an object; PlanService.assertValidPlanFeatures() (called
// from create()/update()) does the real per-entry validation and the controller below maps its
// InvalidPlanFeaturesException to a 422 with a precise message.
const planFeatures = vine.record(vine.any())

const createPlanValidator = vine.create({
  code: vine.string().minLength(2).maxLength(50),
  name: vine.string().minLength(2).maxLength(255),
  description: vine.string().maxLength(1000).optional(),
  features: planFeatures,
  price: moneyAmount.optional(),
  maintenance_price: moneyAmount.optional(),
  currency_code: vine.string().fixedLength(3).optional(),
})

const updatePlanValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255).optional(),
  description: vine.string().maxLength(1000).optional(),
  features: planFeatures.optional(),
  price: moneyAmount.optional(),
  maintenance_price: moneyAmount.optional(),
})

/**
 * Admin CRUD for pricing plans — the feature list assigned here is what
 * business_plan_middleware.ts checks on every gated business API call. Purely additive: adding
 * a feature key here does nothing until a route in start/routes.ts is actually gated with
 * middleware.businessPlan('that.key').
 */
export default class PlansController {
  /** GET /api/v1/plans (admin only) */
  async index({ response }: HttpContext) {
    const plans = await PlanService.list()
    return response.ok({
      data: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        features: p.features,
        price: p.price.toString(),
        maintenance_price: p.maintenancePrice.toString(),
        currency_code: p.currencyCode,
        status: p.status,
        created_at: p.createdAt,
      })),
    })
  }

  /** GET /api/v1/plans/:id (admin only) */
  async show({ params, response }: HttpContext) {
    try {
      const plan = await PlanService.findByIdOrFail(Number(params.id))
      return response.ok({
        data: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          features: plan.features,
          price: plan.price.toString(),
          maintenance_price: plan.maintenancePrice.toString(),
          currency_code: plan.currencyCode,
          status: plan.status,
          created_at: plan.createdAt,
          updated_at: plan.updatedAt,
        },
      })
    } catch (error) {
      if (error instanceof PlanNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/plans (admin only) */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(createPlanValidator)

    try {
      const plan = await PlanService.create(
        {
          ...payload,
          price: payload.price !== undefined ? BigInt(payload.price) : undefined,
          maintenancePrice:
            payload.maintenance_price !== undefined ? BigInt(payload.maintenance_price) : undefined,
          currencyCode: payload.currency_code,
        },
        user.id,
        correlationId
      )
      return response.created({
        data: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          features: plan.features,
          price: plan.price.toString(),
          maintenance_price: plan.maintenancePrice.toString(),
          currency_code: plan.currencyCode,
          status: plan.status,
        },
      })
    } catch (error) {
      if (error instanceof PlanCodeTakenException) {
        return response.conflict({ message: error.message })
      }
      if (error instanceof InvalidPlanFeaturesException) {
        return response.unprocessableEntity({ message: error.message })
      }
      const err = error as any
      return response.internalServerError({ message: err.message || 'Plan creation failed' })
    }
  }

  /** PATCH /api/v1/plans/:id (admin only) */
  async update({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(updatePlanValidator)

    try {
      const plan = await PlanService.update(
        Number(params.id),
        {
          ...payload,
          price: payload.price !== undefined ? BigInt(payload.price) : undefined,
          maintenancePrice:
            payload.maintenance_price !== undefined ? BigInt(payload.maintenance_price) : undefined,
        },
        user.id,
        correlationId
      )
      return response.ok({
        data: {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          features: plan.features,
          price: plan.price.toString(),
          maintenance_price: plan.maintenancePrice.toString(),
        },
      })
    } catch (error) {
      if (error instanceof PlanNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof InvalidPlanFeaturesException) {
        return response.unprocessableEntity({ message: error.message })
      }
      const err = error as any
      return response.badRequest({ message: err.message || 'Plan update failed' })
    }
  }

  /** POST /api/v1/plans/:id/archive (admin only) — plans are archived, never hard-deleted */
  async archive({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    try {
      const plan = await PlanService.archive(Number(params.id), user.id, correlationId)
      return response.ok({ data: { id: plan.id, status: plan.status } })
    } catch (error) {
      if (error instanceof PlanNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
}
