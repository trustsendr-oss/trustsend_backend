import { BaseCommand } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
import { WebhookService } from '#services/webhooks/webhook_service'
import { assertSafeOutboundUrl, UnsafeWebhookUrlException } from '#services/security/ssrf_guard'

const DELIVERY_TIMEOUT_MS = 10_000

/**
 * Sends queued webhook deliveries (webhook_deliveries, status pending/retrying and due) — the
 * counterpart to MobileMoneyDeposit/PayoutService queuing a delivery on a terminal transaction
 * status. Not run automatically — schedule externally via cron (the project's BullMQ queue
 * isn't functional today, same constraint as mobile-money:reconcile).
 */
export default class DeliverPendingWebhooks extends BaseCommand {
  static commandName = 'webhooks:deliver-pending'
  static description = 'Send queued webhook deliveries to their subscribed URLs'

  static options = {
    startApp: true,
  }

  async run() {
    const deliveries = await WebhookService.getPendingDeliveries()

    let sent = 0
    let failed = 0

    for (const delivery of deliveries) {
      const subscription = await db
        .from('webhook_subscriptions')
        .where('id', delivery.subscriptionId)
        .where('active', true)
        .first()

      if (!subscription) {
        // Subscription was deleted/deactivated since this delivery was queued — drop it.
        await WebhookService.markSuccess(delivery.id)
        continue
      }

      const body = JSON.stringify(delivery.payload)
      const signature = WebhookService.sign(body, subscription.secret)

      try {
        // Re-validated on every send (not just at subscription time): DNS can change between
        // when a URL was registered and when a delivery actually fires, and this is the ONLY
        // thing standing between "deliver to a merchant" and "SSRF into our own network" — see
        // ssrf_guard.ts.
        await assertSafeOutboundUrl(subscription.url)

        const response = await fetch(subscription.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': delivery.eventType,
          },
          body,
          redirect: 'manual', // never blindly follow a redirect to an unvalidated destination
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        })

        if (response.type === 'opaqueredirect') {
          await WebhookService.markFailed(delivery.id, 'Redirect blocked (SSRF protection)', delivery.retryCount)
          failed++
        } else if (response.ok) {
          await WebhookService.markSuccess(delivery.id)
          sent++
        } else {
          await WebhookService.markFailed(delivery.id, `HTTP ${response.status}`, delivery.retryCount)
          failed++
        }
      } catch (error) {
        const err = error as Error
        if (err instanceof UnsafeWebhookUrlException) {
          this.logger.warning(`Blocked unsafe webhook URL for subscription ${subscription.id}: ${err.message}`)
        }
        await WebhookService.markFailed(delivery.id, err.message, delivery.retryCount)
        failed++
      }
    }

    this.logger.info(`Delivered ${sent}, failed/retrying ${failed}, out of ${deliveries.length} due`)
  }
}
