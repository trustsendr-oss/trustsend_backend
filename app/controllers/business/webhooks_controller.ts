import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { WebhookService, parseJsonColumn } from '#services/webhooks/webhook_service'
import vine from '@vinejs/vine'

const createWebhookValidator = vine.create({
  url: vine.string().url(),
  events: vine.array(
    vine.enum([
      'mobile_money_deposit.completed',
      'mobile_money_deposit.failed',
      'mobile_money_payout.completed',
      'mobile_money_payout.failed',
    ])
  ),
})

/**
 * Business equivalent of webhooks_controller.ts — same WebhookService, scoped to `ctx.business`
 * instead of `auth.user`.
 */
export default class BusinessWebhooksController {
  /**
   * GET /api/v1/business/webhooks
   */
  async index({ business, response }: HttpContext) {
    const subscriptions = await db
      .from('webhook_subscriptions')
      .where('business_id', business.id)
      .select('id', 'url', 'events', 'active', 'created_at')

    return response.ok({
      data: subscriptions.map((sub) => ({
        id: sub.id,
        url: sub.url,
        events: parseJsonColumn<string[]>(sub.events),
        active: sub.active,
        created_at: sub.created_at,
      })),
    })
  }

  /**
   * POST /api/v1/business/webhooks
   */
  async store({ business, request, response }: HttpContext) {
    const payload = await request.validateUsing(createWebhookValidator)

    try {
      const subscription = await WebhookService.subscribe('business', business.id, payload.url, payload.events)

      return response.created({
        data: {
          url: subscription.url,
          events: subscription.events,
          active: subscription.active,
          secret: subscription.secret,
          message: 'Webhook subscribed. Store the secret securely — used to verify X-Webhook-Signature on delivery.',
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'UnsafeWebhookUrlException') {
        return response.unprocessableEntity({ message: err.message })
      }
      return response.internalServerError({ message: err.message || 'Subscription failed' })
    }
  }

  /**
   * DELETE /api/v1/business/webhooks/:id
   */
  async destroy({ business, params, response }: HttpContext) {
    const subscription = await db
      .from('webhook_subscriptions')
      .where('id', params.id)
      .where('business_id', business.id)
      .first()

    if (!subscription) {
      return response.notFound({ message: 'Webhook not found' })
    }

    await WebhookService.unsubscribe(params.id)
    return response.ok({ message: 'Webhook unsubscribed' })
  }

  /**
   * GET /api/v1/business/webhooks/:id/deliveries
   */
  async getDeliveries({ business, params, response }: HttpContext) {
    const subscription = await db
      .from('webhook_subscriptions')
      .where('id', params.id)
      .where('business_id', business.id)
      .first()

    if (!subscription) {
      return response.notFound({ message: 'Webhook not found' })
    }

    const deliveries = await db
      .from('webhook_deliveries')
      .where('subscription_id', params.id)
      .orderBy('created_at', 'desc')
      .limit(50)

    return response.ok({
      data: deliveries.map((d) => ({
        id: d.id,
        event_type: d.event_type,
        status: d.status,
        retry_count: d.retry_count,
        last_error: d.last_error,
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
    })
  }
}
