import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import crypto from 'crypto'
import { assertSafeOutboundUrl } from '#services/security/ssrf_guard'

export type WebhookOwnerType = 'user' | 'business'

/**
 * Postgres `json`/`jsonb` columns are already deserialized into native JS values by node-pg —
 * calling JSON.parse() on the result again throws (or silently mangles the value, since
 * JSON.parse coerces a non-string argument via String() first). Use this everywhere a `json`
 * column is read via a raw db query, instead of a bare JSON.parse(column).
 */
export function parseJsonColumn<T>(value: unknown): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T)
}

interface WebhookSubscription {
  id: number
  ownerType: WebhookOwnerType
  ownerId: number
  url: string
  events: string[] // ['transaction.completed', 'transfer.received', etc.]
  active: boolean
  secret: string
}

interface WebhookDelivery {
  id: number
  subscriptionId: number
  eventType: string
  payload: Record<string, any>
  status: 'pending' | 'success' | 'failed' | 'retrying'
  retryCount: number
  nextRetryAt: DateTime | null
  lastError: string | null
}

/**
 * Webhook Service - Manage subscriptions and deliveries
 */
export class WebhookService {
  /**
   * Subscribe an owner (user or business) to webhook events. `webhook_subscriptions` enforces
   * exactly one of user_id/business_id being set (see migration
   * 1772500000004_add_business_id_to_webhook_subscriptions).
   *
   * @throws UnsafeWebhookUrlException (via assertSafeOutboundUrl) if `url` resolves to a
   *   private/internal address — this is only a first check for fast feedback to the caller;
   *   deliver_pending_webhooks.ts re-validates on every actual send since DNS can change later.
   */
  static async subscribe(
    ownerType: WebhookOwnerType,
    ownerId: number,
    url: string,
    events: string[]
  ): Promise<WebhookSubscription> {
    await assertSafeOutboundUrl(url)

    const secret = crypto.randomBytes(32).toString('hex')

    await db.insertQuery().table('webhook_subscriptions').insert({
      user_id: ownerType === 'user' ? ownerId : null,
      business_id: ownerType === 'business' ? ownerId : null,
      url,
      events: JSON.stringify(events),
      secret,
      active: true,
      created_at: new Date(),
    })

    return {
      id: 0,
      ownerType,
      ownerId,
      url,
      events,
      active: true,
      secret,
    }
  }

  /**
   * Unsubscribe from webhooks
   */
  static async unsubscribe(subscriptionId: number): Promise<void> {
    await db.from('webhook_subscriptions').where('id', subscriptionId).delete()
    await db.from('webhook_deliveries').where('subscription_id', subscriptionId).delete()
  }

  /**
   * Finds this owner's active subscriptions that include the given event type — used to fan
   * out a delivery when a transaction reaches a terminal state.
   */
  static async findActiveSubscriptions(
    ownerType: WebhookOwnerType,
    ownerId: number,
    eventType: string
  ): Promise<Array<{ id: number; events: string[] }>> {
    const ownerColumn = ownerType === 'user' ? 'user_id' : 'business_id'

    const subscriptions = await db
      .from('webhook_subscriptions')
      .where(ownerColumn, ownerId)
      .where('active', true)
      .select('id', 'events')

    return subscriptions
      .map((s) => ({ id: s.id, events: parseJsonColumn<string[]>(s.events) }))
      .filter((s) => s.events.includes(eventType))
  }

  /** Computes the HMAC-SHA256 signature a delivery is sent with — the counterpart to verifySignature(). */
  static sign(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex')
  }

  /**
   * Verify webhook signature (HMAC-SHA256)
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  }

  /**
   * Create webhook delivery
   */
  static async createDelivery(
    subscriptionId: number,
    eventType: string,
    payload: Record<string, any>
  ): Promise<WebhookDelivery> {
    const delivery = await db.insertQuery().table('webhook_deliveries').insert({
      subscription_id: subscriptionId,
      event_type: eventType,
      payload: JSON.stringify(payload),
      status: 'pending',
      retry_count: 0,
      next_retry_at: new Date(),
      created_at: new Date(),
    })

    return {
      id: delivery[0],
      subscriptionId,
      eventType,
      payload,
      status: 'pending',
      retryCount: 0,
      nextRetryAt: DateTime.now(),
      lastError: null,
    }
  }

  /**
   * Get pending deliveries for retry
   */
  static async getPendingDeliveries(): Promise<WebhookDelivery[]> {
    const deliveries = await db
      .from('webhook_deliveries')
      .whereIn('status', ['pending', 'retrying'])
      .where('next_retry_at', '<=', new Date())
      .limit(100)

    return deliveries.map((d) => ({
      id: d.id,
      subscriptionId: d.subscription_id,
      eventType: d.event_type,
      payload: parseJsonColumn<Record<string, any>>(d.payload),
      status: d.status,
      retryCount: d.retry_count,
      nextRetryAt: d.next_retry_at,
      lastError: d.last_error,
    }))
  }

  /**
   * Mark delivery as successful
   */
  static async markSuccess(deliveryId: number): Promise<void> {
    await db
      .from('webhook_deliveries')
      .where('id', deliveryId)
      .update({
        status: 'success',
        last_error: null,
        updated_at: new Date(),
      })
  }

  /**
   * Mark delivery as failed and schedule retry
   */
  static async markFailed(deliveryId: number, error: string, retryCount: number): Promise<void> {
    // Exponential backoff: 5 min, 15 min, 1 hour, 24 hours
    const delays = [5, 15, 60, 24 * 60]
    const nextRetryMinutes = delays[Math.min(retryCount, delays.length - 1)]

    await db
      .from('webhook_deliveries')
      .where('id', deliveryId)
      .update({
        status: retryCount >= delays.length ? 'failed' : 'retrying',
        retry_count: retryCount + 1,
        last_error: error,
        next_retry_at: new Date(Date.now() + nextRetryMinutes * 60000),
        updated_at: new Date(),
      })
  }
}
