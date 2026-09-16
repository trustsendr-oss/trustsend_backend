import type { HttpContext } from '@adonisjs/core/http'
import Card from '#models/card'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { PayscribeSignatureService } from '#services/cards/payscribe_signature_service'

/**
 * Inbound webhooks FROM Payscribe (card events) — distinct from webhooks_controller.ts, which
 * sends OUTBOUND webhooks TO merchants. Sits outside middleware.auth() (the caller is external)
 * but every request MUST pass signature verification before any business logic runs — see
 * PayscribeSignatureService.
 *
 * Payscribe's payload shape is NOT consistent across event types (confirmed from their docs):
 * card.auth.refund / card.auth.verified nest the card under `card.id` and carry `event_type`;
 * card.status.changed instead uses a top-level `card_id` and a bare `event` key. Both are handled
 * defensively below rather than assuming one shape.
 */
export default class CardWebhooksController {
  async handle({ request, response, logger }: HttpContext) {
    const rawBody = request.raw() || ''

    try {
      PayscribeSignatureService.verify(rawBody, request.header('x-payscribe-signature'))
    } catch (error) {
      const err = error as Error
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'webhook.payscribe.signature_invalid',
        resourceType: 'webhook',
        resourceId: 0,
        after: { message: err.message },
        correlationId: 'unknown',
      })
      return response.unauthorized({ message: 'Invalid signature' })
    }

    const body = request.body() as Record<string, any>
    const eventType: string | undefined = body.event_type || body.event
    const providerCardId: string | undefined = body.card?.id || body.card_id

    if (!eventType || !providerCardId) {
      return response.badRequest({ message: 'Missing event type or card id' })
    }

    try {
      switch (eventType) {
        case 'cards.adjusted.refund':
        case 'card.adjusted.refund':
          await this.handleAuthRefund(providerCardId, body)
          break
        case 'cards.auth.verified':
        case 'card.auth.verified':
          // Informational only — an authorization check, not a completed spend. Nothing to
          // reconcile on our side (see card_service.ts's balance_cache caveat).
          break
        case 'card.status.changed':
          await this.handleStatusChanged(providerCardId, body)
          break
        default:
          logger?.warn({ eventType }, 'payscribe.webhook.unknown_event_type')
      }
    } catch (error) {
      // Never surface a 5xx to Payscribe for an internal processing error — that triggers their
      // retry loop for something a retry can't fix. Log for manual investigation.
      logger?.error({ error, eventType, providerCardId }, 'payscribe.webhook.processing_failed')
    }

    return response.ok({ message: 'Received' })
  }

  private async handleAuthRefund(providerCardId: string, body: Record<string, any>): Promise<void> {
    const card = await Card.query()
      .where('provider', 'payscribe')
      .where('provider_card_id', providerCardId)
      .first()
    if (!card) return // Not one of ours (or not yet synced) — nothing to update.

    const newBalance = body.card?.balance
    if (typeof newBalance === 'number') {
      // Payscribe reports balance as a decimal (e.g. 2.51); this column is smallest-unit (cents).
      card.balanceCache = BigInt(Math.round(newBalance * 100))
      await card.save()
    }

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'card.spend_recorded',
      resourceType: 'card',
      resourceId: card.id,
      after: {
        amount: body.amount,
        acceptor_name: body.acceptor_name,
        auth_currency: body.auth_currency,
        new_balance: newBalance,
      },
      correlationId: body.trans_id || body.event_id || 'unknown',
    })

    const ownerType = card.userId ? 'user' : 'business'
    const ownerId = card.userId ?? card.businessId!
    await InAppNotificationService.notify({
      recipientType: ownerType,
      recipientId: ownerId,
      type: 'card.spend',
      title: 'Card transaction',
      message:
        `${body.amount} ${body.auth_currency || ''} at ${body.acceptor_name || 'a merchant'}`.trim(),
      data: { card_id: card.id },
    })
  }

  private async handleStatusChanged(
    providerCardId: string,
    body: Record<string, any>
  ): Promise<void> {
    const card = await Card.query()
      .where('provider', 'payscribe')
      .where('provider_card_id', providerCardId)
      .first()
    if (!card) return

    const newStatus = body.new_status as string | undefined
    const localStatus = this.mapProviderStatus(newStatus)
    if (!localStatus) return

    const before = card.status
    card.status = localStatus
    await card.save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'card.status_synced_from_webhook',
      resourceType: 'card',
      resourceId: card.id,
      before: { status: before },
      after: { status: localStatus, provider_status: newStatus },
      correlationId: 'unknown',
    })
  }

  private mapProviderStatus(providerStatus: string | undefined): Card['status'] | null {
    switch (providerStatus) {
      case 'active':
        return 'active'
      case 'frozen':
      case 'blocked':
        return 'frozen'
      case 'terminated':
      case 'closed':
        return 'terminated'
      default:
        return null
    }
  }
}
