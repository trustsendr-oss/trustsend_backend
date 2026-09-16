import type { HttpContext } from '@adonisjs/core/http'
import Plan from '#models/plan'
import { PinService } from '#services/security/pin_service'
import {
  PlanService,
  PlanNotFoundException,
  PlanWalletMissingException,
  InsufficientPlanBalanceException,
  PlanAlreadyActiveException,
  PlanDowngradeNotAllowedException,
} from '#services/business/plan_service'
import { subscribeToPlanValidator } from '#validators/business_plan'

/**
 * Shared by both business access paths (see routes.ts), same as the other business/* controllers.
 */
export default class BusinessPlanController {
  /** GET /api/v1/business/plans — catalogue of plans this business can subscribe to. */
  async index({ response }: HttpContext) {
    const plans = await Plan.query().where('status', 'active').orderBy('price', 'asc')

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
      })),
    })
  }

  /**
   * GET /api/v1/business/plan — this business's currently active plan, and its subscription
   * status (when it was subscribed, when the next maintenance charge is due, whether the last
   * one failed).
   */
  async current({ business, response }: HttpContext) {
    await business.load('plan')

    if (!business.plan) {
      return response.ok({
        data: null,
        message: 'No plan assigned — every API is currently unrestricted (fail-open).',
      })
    }

    return response.ok({
      data: {
        id: business.plan.id,
        code: business.plan.code,
        name: business.plan.name,
        description: business.plan.description,
        features: business.plan.features,
        price: business.plan.price.toString(),
        maintenance_price: business.plan.maintenancePrice.toString(),
        currency_code: business.plan.currencyCode,
        subscribed_at: business.planSubscribedAt,
        next_maintenance_billing_at: business.planNextMaintenanceBillingAt,
        payment_status: business.planPaymentStatus,
      },
    })
  }

  /**
   * POST /api/v1/business/plan/subscribe
   * Charges the plan's one-time price (if any) from the business's own wallet in the plan's
   * currency, then switches the business onto it immediately. A dashboard session must confirm
   * with its PIN — same pattern as business/payouts_controller.ts — an API key call needs none
   * (the key itself is the credential).
   */
  async subscribe({ business, businessAuthMethod, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(subscribeToPlanValidator)

    if (businessAuthMethod === 'dashboard') {
      if (!payload.pin) {
        return response.badRequest({ message: 'PIN is required to subscribe to a plan' })
      }
      const pinVerification = await PinService.verifyPin(business, payload.pin)
      if (!pinVerification.valid) {
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }
    }

    try {
      const updated = await PlanService.subscribe(business.id, payload.plan_id, correlationId)
      await updated.load('plan')

      return response.ok({
        data: {
          id: updated.id,
          plan: {
            id: updated.plan.id,
            code: updated.plan.code,
            name: updated.plan.name,
            price_charged: updated.plan.price.toString(),
            currency_code: updated.plan.currencyCode,
          },
          subscribed_at: updated.planSubscribedAt,
          next_maintenance_billing_at: updated.planNextMaintenanceBillingAt,
        },
      })
    } catch (error) {
      if (error instanceof PlanNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (
        error instanceof PlanWalletMissingException ||
        error instanceof InsufficientPlanBalanceException
      ) {
        return response.unprocessableEntity({ message: error.message })
      }
      if (error instanceof PlanAlreadyActiveException) {
        return response.conflict({ message: error.message })
      }
      if (error instanceof PlanDowngradeNotAllowedException) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }
}
