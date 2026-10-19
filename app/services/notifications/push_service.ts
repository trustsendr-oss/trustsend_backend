import env from '#start/env'
import Agent from '#models/agent'
import PushToken from '#models/push_token'
import type Notification from '#models/notification'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000

type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } }

/**
 * Push notifications through Expo's push service, mirroring the in-app notifications.
 *
 * Every in-app row is also pushed (see InAppNotificationService.notify): one entry point covers
 * every event that already notifies someone, and a new one cannot be added to the screen while
 * being forgotten on the phone.
 *
 * Best effort by design. The in-app row is the record; a push that fails, times out or reaches
 * no device changes nothing for the operation that triggered it, so nothing here throws.
 */
export class PushService {
  /** Attaches `token` to `userId`, taking it from any account it was on before. */
  static async register(userId: number, token: string, platform: string): Promise<void> {
    await PushToken.updateOrCreate({ token }, { userId, platform })
  }

  /** Removes the token if it belongs to `userId` — a caller cannot unregister someone else. */
  static async unregister(userId: number, token: string): Promise<void> {
    await PushToken.query().where('token', token).where('user_id', userId).delete()
  }

  /** Pushes an in-app notification to its recipient's devices. Never throws. */
  static async forNotification(notification: Notification): Promise<void> {
    try {
      const userId = await this.userIdFor(notification.recipientType, notification.recipientId)
      if (!userId) return

      const tokens = await PushToken.query().where('user_id', userId).select('token')
      if (tokens.length === 0) return

      await this.send(
        tokens.map((row) => row.token),
        {
          title: notification.title,
          body: notification.message,
          // The app opens its notifications screen on tap; the id lets it mark this one read.
          data: { notificationId: notification.id, type: notification.type, url: '/notifications' },
        }
      )
    } catch (error) {
      console.error(`Push failed for notification ${notification.id}:`, error)
    }
  }

  /**
   * The app account behind a recipient. An agent works from the same app as customers, signed
   * in as the user linked to the agent; a business has no app session, so it gets no push.
   */
  private static async userIdFor(type: string, id: number): Promise<number | null> {
    if (type === 'user') return id
    if (type === 'agent') {
      const agent = await Agent.find(id)
      return agent?.userId ?? null
    }
    return null
  }

  private static async send(
    tokens: string[],
    message: { title: string; body: string; data: Record<string, unknown> }
  ): Promise<void> {
    const accessToken = env.get('EXPO_ACCESS_TOKEN')

    for (let start = 0; start < tokens.length; start += BATCH_SIZE) {
      const batch = tokens.slice(start, start + BATCH_SIZE)
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({ to, sound: 'default', channelId: 'default', ...message }))
        ),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        console.error(`Expo push rejected a batch: HTTP ${response.status}`)
        continue
      }

      // Tickets come back in the order the messages were sent. A device that uninstalled the
      // app or revoked the permission is reported here: its token is dropped so it stops
      // costing a request on every notification.
      const { data } = (await response.json()) as { data?: ExpoTicket[] }
      const stale = (data ?? [])
        .map((ticket, index) =>
          ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered'
            ? batch[index]
            : null
        )
        .filter((token): token is string => token !== null)

      if (stale.length > 0) {
        await PushToken.query().whereIn('token', stale).delete()
      }
    }
  }
}
