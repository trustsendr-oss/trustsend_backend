import type { HttpContext } from '@adonisjs/core/http'
import { PawaPaySignatureService } from '#services/mobile_money/pawapay_signature_service'
import { MobileMoneyDepositService } from '#services/mobile_money/mobile_money_deposit_service'
import { MobileMoneyPayoutService } from '#services/mobile_money/mobile_money_payout_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

interface PawaPayCallbackBody {
  depositId?: string
  payoutId?: string
  status: 'COMPLETED' | 'FAILED' | string
  providerTransactionId?: string
  failureReason?: { failureCode: string; failureMessage: string }
}

/**
 * Inbound webhooks FROM PawaPay — distinct from webhooks_controller.ts, which sends OUTBOUND
 * webhooks TO merchants. These routes sit outside middleware.auth() (the caller is external)
 * but every request MUST pass signature verification before any business logic runs — see
 * PawaPaySignatureService for why this is non-negotiable.
 */
export default class MobileMoneyWebhooksController {
  async handleDeposit({ request, response, logger }: HttpContext) {
    const body = await this.verifyAndParse(request, response, 'deposit')
    if (!body) return // response already sent by verifyAndParse

    if (!body.depositId) {
      return response.badRequest({ message: 'Missing depositId' })
    }

    if (body.status !== 'COMPLETED' && body.status !== 'FAILED') {
      // Not a final status — ignore (PawaPay only calls back on final status per their docs,
      // but don't assume that's the only thing that will ever arrive).
      return response.ok({ message: 'Ignored: not a final status' })
    }

    try {
      await MobileMoneyDepositService.confirmFromCallback('pawapay', body.depositId, body.status, {
        providerTransactionId: body.providerTransactionId,
        failureReason: body.failureReason
          ? { code: body.failureReason.failureCode, message: body.failureReason.failureMessage }
          : undefined,
      })
    } catch (error) {
      // Never surface a 5xx to PawaPay for an internal processing error — that would trigger
      // their retry loop for something a retry can't fix. Log for manual investigation;
      // the reconciliation sweep is also a fallback.
      const err = error as any
      logger?.error({ error: err }, 'mobile_money.deposit.callback_processing_failed')
    }

    return response.ok({ message: 'Received' })
  }

  async handlePayout({ request, response, logger }: HttpContext) {
    const body = await this.verifyAndParse(request, response, 'payout')
    if (!body) return

    if (!body.payoutId) {
      return response.badRequest({ message: 'Missing payoutId' })
    }

    if (body.status !== 'COMPLETED' && body.status !== 'FAILED') {
      return response.ok({ message: 'Ignored: not a final status' })
    }

    try {
      await MobileMoneyPayoutService.confirmFromCallback('pawapay', body.payoutId, body.status, {
        providerTransactionId: body.providerTransactionId,
        failureReason: body.failureReason
          ? { code: body.failureReason.failureCode, message: body.failureReason.failureMessage }
          : undefined,
      })
    } catch (error) {
      const err = error as any
      logger?.error({ error: err }, 'mobile_money.payout.callback_processing_failed')
    }

    return response.ok({ message: 'Received' })
  }

  /**
   * Verifies the PawaPay signature and returns the parsed body, or sends a 401 and returns
   * null if verification fails. Callers must check for a null return and stop.
   */
  private async verifyAndParse(
    request: HttpContext['request'],
    response: HttpContext['response'],
    kind: 'deposit' | 'payout'
  ): Promise<PawaPayCallbackBody | null> {
    try {
      await PawaPaySignatureService.verify({
        method: request.method(),
        authority: request.header('host') || '',
        path: request.url(false),
        headers: request.headers() as Record<string, string | undefined>,
        rawBody: request.raw() || '',
      })
    } catch (error) {
      const err = error as any
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'webhook.pawapay.signature_invalid',
        resourceType: 'webhook',
        resourceId: 0,
        before: undefined,
        after: { kind, message: err.message },
        correlationId: 'unknown',
      })
      response.unauthorized({ message: 'Invalid signature' })
      return null
    }

    return request.body() as PawaPayCallbackBody
  }
}
