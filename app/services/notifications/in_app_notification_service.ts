import Notification from '#models/notification'

export type NotificationRecipientType = 'user' | 'agent' | 'business'

/**
 * Real, persisted in-app notifications — distinct from notification_service.ts, which is an
 * unwired email/SMS placeholder. This is what powers an actual notification page: rows land in
 * the `notifications` table and are read back through NotificationsController /
 * business_dashboard/notifications_controller.ts.
 */
export class InAppNotificationService {
  static async notify(params: {
    recipientType: NotificationRecipientType
    recipientId: number
    type: string
    title: string
    message: string
    data?: Record<string, any>
  }): Promise<Notification> {
    const notification = new Notification()
    notification.recipientType = params.recipientType
    notification.recipientId = params.recipientId
    notification.type = params.type
    notification.title = params.title
    notification.message = params.message
    notification.data = params.data || null

    await notification.save()
    return notification
  }
}
