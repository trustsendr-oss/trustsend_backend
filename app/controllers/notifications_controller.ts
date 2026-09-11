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

export default class NotificationsController {
  /**
   * GET /api/v1/notifications
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const query = await request.validateUsing(listNotificationsValidator)
    const page = query.page || 1
    const limit = query.limit || 20

    const notificationsQuery = Notification.query()
      .where('recipient_type', 'user')
      .where('recipient_id', user.id)
      .orderBy('created_at', 'desc')

    if (query.unread) {
      notificationsQuery.whereNull('read_at')
    }

    const paginated = await notificationsQuery.paginate(page, limit)

    const unreadCount = await db
      .query()
      .from('notifications')
      .where('recipient_type', 'user')
      .where('recipient_id', user.id)
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
   * PATCH /api/v1/notifications/:id/read
   */
  async markRead({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const notification = await Notification.query()
      .where('id', params.id)
      .where('recipient_type', 'user')
      .where('recipient_id', user.id)
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
   * POST /api/v1/notifications/read-all
   */
  async markAllRead({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const unread = await Notification.query()
      .where('recipient_type', 'user')
      .where('recipient_id', user.id)
      .whereNull('read_at')

    const now = DateTime.now()
    for (const notification of unread) {
      notification.readAt = now
      await notification.save()
    }

    return response.ok({ message: 'All notifications marked as read', count: unread.length })
  }
}
