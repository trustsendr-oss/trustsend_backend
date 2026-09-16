import type { HttpContext } from '@adonisjs/core/http'
import { WebhookService, parseJsonColumn } from '#services/webhooks/webhook_service'
import vine from '@vinejs/vine'

const createWebhookValidator = vine.create({
  url: vine.string().url(),
  events: vine.array(vine.string()),
})

export default class WebhooksController {
  /**
   * GET /api/v1/webhooks
   * List user's webhook subscriptions
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const subscriptions = await (
      await import('@adonisjs/lucid/services/db')
    ).default
      .from('webhook_subscriptions')
      .where('user_id', user.id)
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
   * POST /api/v1/webhooks
   * Subscribe to webhook events
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createWebhookValidator)

    try {
      const subscription = await WebhookService.subscribe(
        'user',
        user.id,
        payload.url,
        payload.events
      )

      return response.created({
        data: {
          id: subscription.ownerId,
          url: subscription.url,
          events: subscription.events,
          active: subscription.active,
          secret: subscription.secret,
          message: 'Webhook subscribed. Store the secret securely for verification.',
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
   * DELETE /api/v1/webhooks/:id
   * Unsubscribe from webhooks
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      // Verify ownership
      const subscription = await (
        await import('@adonisjs/lucid/services/db')
      ).default
        .from('webhook_subscriptions')
        .where('id', params.id)
        .where('user_id', user.id)
        .first()

      if (!subscription) {
        return response.notFound({ message: 'Webhook not found' })
      }

      await WebhookService.unsubscribe(params.id)

      return response.ok({
        message: 'Webhook unsubscribed',
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Unsubscribe failed' })
    }
  }

  /**
   * GET /api/v1/webhooks/:id/deliveries
   * Get webhook delivery history
   */
  async getDeliveries({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      // Verify ownership
      const subscription = await (
        await import('@adonisjs/lucid/services/db')
      ).default
        .from('webhook_subscriptions')
        .where('id', params.id)
        .where('user_id', user.id)
        .first()

      if (!subscription) {
        return response.notFound({ message: 'Webhook not found' })
      }

      const deliveries = await (
        await import('@adonisjs/lucid/services/db')
      ).default
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
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Failed to fetch deliveries' })
    }
  }
}
