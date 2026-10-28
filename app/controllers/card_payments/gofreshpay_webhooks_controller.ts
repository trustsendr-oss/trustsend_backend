import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { GoFreshPaySignature } from '#services/card_payments/gofreshpay_signature'
import { cardDetailsOf } from '#services/card_payments/gofreshpay_gateway'
import {
  CardDepositException,
  CardDepositService,
} from '#services/card_payments/card_deposit_service'

/**
 * POST /api/v1/webhooks/gofreshpay
 *
 * Not behind middleware.auth() (GoFreshPay calls it); every event that moves money is HMAC-signed
 * with our callback secret and verified here against the raw body, before anything is parsed.
 *
 * - payment (no `event_type`, `status` SUCCESS|FAILED): settled through CardDepositService.settle,
 *   the same idempotent path as the charge response and the sweep;
 * - REFUND / VOID: recorded for the team. Reversing a credit that may already have been spent is a
 *   decision, not an automatic posting;
 * - PAYMENT_CANCELLATION: unsigned by design on their side, so informational only.
 *
 * Answers: 2xx once handled (or deliberately ignored), 401 on a bad signature (no retry), 5xx on
 * our own failure so GoFreshPay retries.
 */
export default class GoFreshPayWebhooksController {
  async handle({ request, response }: HttpContext) {
    const rawBody = request.raw() ?? ''
    const payload = (() => {
      try {
        return JSON.parse(rawBody)
      } catch {
        return null
      }
    })()
    if (!payload || typeof payload !== 'object') {
      return response.badRequest({ message: 'Invalid payload' })
    }

    if (payload.event_type === 'PAYMENT_CANCELLATION') {
      logger.info(
        { transaction_uuid: payload.transaction_uuid },
        'gofreshpay: checkout cancelled (unsigned, ignored)'
      )
      return response.ok({ received: true })
    }

    const signed = GoFreshPaySignature.verifyWebhook(
      env.get('GOFRESHPAY_CALLBACK_SECRET') ?? '',
      request.header('x-freshpay-signature'),
      rawBody
    )
    if (!signed) {
      logger.warn(
        { transaction_uuid: payload.transaction_uuid },
        'gofreshpay: webhook signature rejected'
      )
      return response.unauthorized({ message: 'Invalid signature' })
    }

    const transactionUuid =
      typeof payload.transaction_uuid === 'string' ? payload.transaction_uuid : null
    if (!transactionUuid) {
      return response.badRequest({ message: 'transaction_uuid missing' })
    }

    if (payload.event_type === 'REFUND' || payload.event_type === 'VOID') {
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: `card_deposit.gateway_${String(payload.event_type).toLowerCase()}_reported`,
        resourceType: 'card_deposit_gateway_transaction',
        resourceId: transactionUuid,
        after: {
          amount: payload.amount,
          currency: payload.currency,
          refunded_total: payload.refunded_total,
          reason: payload.reason,
          reason_code: payload.reason_code,
          reference: payload.reference,
        },
        correlationId: String(payload.reference ?? transactionUuid),
      })
      logger.error(
        { transaction_uuid: transactionUuid, event: payload.event_type, amount: payload.amount },
        'gofreshpay: card payment reversed on their side — ledger needs a manual decision'
      )
      return response.ok({ received: true })
    }

    if (payload.status !== 'SUCCESS' && payload.status !== 'FAILED') {
      return response.ok({ received: true, ignored: true })
    }

    try {
      // An ACCEPT is the only success that credits. REVIEW (Decision Manager holding the payment)
      // stays undecided until GoFreshPay sends the final word or the sweep reads it.
      if (payload.status === 'SUCCESS' && payload.decision && payload.decision !== 'ACCEPT') {
        logger.warn(
          { transaction_uuid: transactionUuid, decision: payload.decision },
          'gofreshpay: success not yet accepted'
        )
        return response.ok({ received: true, pending: true })
      }

      await CardDepositService.settle(transactionUuid, {
        ...cardDetailsOf(payload),
        status: payload.status,
        reasonCode:
          typeof payload.reason_code === 'string'
            ? payload.reason_code
            : (payload.decision ?? null),
        message: typeof payload.message === 'string' ? payload.message : null,
        amountMajor:
          payload.amount !== null && payload.amount !== undefined ? String(payload.amount) : null,
        currencyCode: typeof payload.currency === 'string' ? payload.currency : null,
        source: 'webhook',
      })
      return response.ok({ received: true })
    } catch (error) {
      if (error instanceof CardDepositException && error.code === 'SESSION_NOT_FOUND') {
        // Not one of ours (another merchant environment, or a test payload): nothing to retry.
        logger.warn(
          { transaction_uuid: transactionUuid },
          'gofreshpay: webhook for an unknown transaction'
        )
        return response.ok({ received: true, ignored: true })
      }
      logger.error(
        { err: error, transaction_uuid: transactionUuid },
        'gofreshpay: webhook handling failed'
      )
      return response.internalServerError({ message: 'Webhook handling failed' })
    }
  }
}
