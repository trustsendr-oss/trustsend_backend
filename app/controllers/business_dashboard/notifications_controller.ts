import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import Notification from '#models/notification'

const listNotificationsValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  unread: vine.boolean().optional(),
})

/**
 * Business equivalent of notifications_controller.ts — same Notification model, scoped to
 * ctx.business instead of auth.user. Dashboard-only (no equivalent under the businessApiKey
 * group): a notification feed is a human-facing concept, not something a server-to-server
 * integration polls — an integrator uses webhooks (webhooks_controller.ts) for that instead.
 */
export default class BusinessNotificationsController {
  /**
   * GET /api/v1/business/dashboard/notifications
   */
  async index({ business, request, response }: HttpContext) {
    const query = await request.validateUsing(listNotificationsValidator)
    const page = query.page || 1
    const limit = query.limit || 20

    const notificationsQuery = Notification.query()
      .where('recipient_type', 'business')
      .where('recipient_id', business.id)
      .orderBy('created_at', 'desc')

    if (query.unread) {
      notificationsQuery.whereNull('read_at')
    }

    const paginated = await notificationsQuery.paginate(page, limit)

    const unreadCount = await db
      .query()
      .from('notifications')
      .where('recipient_type', 'business')
      .where('recipient_id', business.id)
      .whereNull('read_at')
      .count('* as count')
      .first()

    return response.ok({
      data: paginated.all().map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.readAt !== null,
        created_at: n.createdAt,
      })),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit,
        unread_count: Number(unreadCount?.count || 0),
      },
    })
  }

  /**
   * PATCH /api/v1/business/dashboard/notifications/:id/read
   */
  async markRead({ business, params, response }: HttpContext) {
    const notification = await Notification.query()
      .where('id', params.id)
      .where('recipient_type', 'business')
      .where('recipient_id', business.id)
      .first()

    if (!notification) {
      return response.notFound({ message: 'Notification not found' })
    }

    if (!notification.readAt) {
      notification.readAt = DateTime.now()
      await notification.save()
    }

    return response.ok({ data: { id: notification.id, read: true } })
  }

  /**
   * POST /api/v1/business/dashboard/notifications/read-all
   */
  async markAllRead({ business, response }: HttpContext) {
    const unread = await Notification.query()
      .where('recipient_type', 'business')
      .where('recipient_id', business.id)
      .whereNull('read_at')

    const now = DateTime.now()
    for (const notification of unread) {
      notification.readAt = now
      await notification.save()
    }

    return response.ok({ message: 'All notifications marked as read', count: unread.length })
  }
}
