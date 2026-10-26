import env from '#start/env'
import Agent from '#models/agent'
import PushToken from '#models/push_token'
import type Notification from '#models/notification'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
/** Expo has a delivery receipt for a ticket a few seconds after sending. */
const RECEIPT_DELAY_MS = 15_000
/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100
const REQUEST_TIMEOUT_MS = 10_000

type ExpoTicket =
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } }

type ExpoReceipt =
  { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } }

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
   * Pushes straight to app users, without an in-app row. For conversation messages: each one
   * is worth a push, but a row per message would bury every other notification. Never throws.
   */
  static async toUsers(
    userIds: number[],
    message: { title: string; body: string; data: Record<string, unknown> }
  ): Promise<void> {
    try {
      if (userIds.length === 0) return
      const tokens = await PushToken.query().whereIn('user_id', userIds).select('token')
      if (tokens.length === 0) return
      await this.send(
        tokens.map((row) => row.token),
        message
      )
    } catch (error) {
      console.error('Push to users failed:', error)
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

      // Tickets come back in the order the messages were sent. A ticket only says Expo took
      // the message; whether the device got it is in the receipt, checked a little later.
      const body = (await response.json()) as { data?: ExpoTicket[] }
      const tickets = body.data ?? []
      const stale: string[] = []
      const pending = new Map<string, string>()
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          pending.set(ticket.id, batch[index])
        } else {
          if (ticket.details?.error === 'DeviceNotRegistered') stale.push(batch[index])
          console.error(`Expo push refused: ${ticket.details?.error ?? ''} ${ticket.message}`)
        }
      })

      if (stale.length > 0) await this.forget(stale)
      if (pending.size > 0) {
        setTimeout(() => void this.checkReceipts(pending), RECEIPT_DELAY_MS).unref()
      }
    }
  }

  /**
   * Reads the delivery receipts of sent pushes. A device that uninstalled the app shows up here
   * (FCM/APNs answer only after Expo hands the message over), not in the ticket: its token is
   * dropped so it stops costing a request on every notification. Other failures — invalid push
   * credentials on the Expo project, an oversized message — are logged, being configuration
   * problems someone has to fix.
   */
  private static async checkReceipts(pending: Map<string, string>): Promise<void> {
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...pending.keys()] }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) return

      const { data } = (await response.json()) as { data?: Record<string, ExpoReceipt> }
      const stale: string[] = []
      for (const [id, receipt] of Object.entries(data ?? {})) {
        if (receipt.status !== 'error') continue
        if (receipt.details?.error === 'DeviceNotRegistered') {
          const token = pending.get(id)
          if (token) stale.push(token)
        } else {
          console.error(
            `Expo push not delivered: ${receipt.details?.error ?? ''} ${receipt.message}`
          )
        }
      }
      if (stale.length > 0) await this.forget(stale)
    } catch (error) {
      console.error('Expo push receipts could not be read:', error)
    }
  }

  private static async forget(tokens: string[]): Promise<void> {
    await PushToken.query().whereIn('token', tokens).delete()
  }
}
