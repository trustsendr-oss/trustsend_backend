import type { HttpContext } from '@adonisjs/core/http'
import { PawaPaySignatureService } from '#services/mobile_money/pawapay_signature_service'
import { MobileMoneyDepositService } from '#services/mobile_money/mobile_money_deposit_service'
import { MobileMoneyPayoutService } from '#services/mobile_money/mobile_money_payout_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { SandboxMode } from '#services/sandbox/sandbox_mode'
// Nommé appLogger : les handlers reçoivent déjà un `logger` depuis le HttpContext.
import appLogger from '@adonisjs/core/services/logger'

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
   * TEMPORAIRE — journalise le callback tel qu'il arrive, avant toute vérification.
   *
   * pawapay_signature_service.ts prévient que sa lecture des en-têtes est transcrite de la
   * documentation sans avoir jamais été confrontée à un vrai callback. Tant que ce n'est pas
   * fait, un rejet ne dit pas SI la signature est fausse ou si c'est nous qui construisons mal
   * la base de signature. Ces lignes donnent la réponse à partir d'un appel réel.
   *
   * Sandbox uniquement : en production, ce corps contient des numéros de téléphone de vrais
   * clients, et ils n'ont rien à faire dans les journaux. À retirer une fois la signature
   * validée contre un callback authentique.
   */
  private logRawCallback(request: HttpContext['request'], kind: 'deposit' | 'payout') {
    if (!SandboxMode.isEnabled()) return

    const headers = request.headers() as Record<string, string | undefined>

    appLogger.info(
      {
        kind,
        method: request.method(),
        // L'autorité est couverte par la signature : si nginx ne transmet pas le Host
        // d'origine, l'app voit 127.0.0.1:3331 et aucune signature ne peut correspondre.
        host: headers['host'],
        forwardedHost: headers['x-forwarded-host'],
        forwardedProto: headers['x-forwarded-proto'],
        path: request.url(false),
        signatureInput: headers['signature-input'],
        signature: headers['signature'],
        contentDigest: headers['content-digest'],
        // Les noms reçus, pour repérer une casse ou un en-tête absent de ce qu'on attend.
        headerNames: Object.keys(headers).sort(),
        rawBody: request.raw(),
      },
      'mobile_money.pawapay.callback_received'
    )
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
    this.logRawCallback(request, kind)

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
      // Le motif exact du refus, lisible dans les journaux du conteneur : sans lui il faut
      // aller lire audit_logs en base pour savoir quelle vérification a échoué.
      if (SandboxMode.isEnabled()) {
        appLogger.warn(
          { kind, reason: err.message },
          'mobile_money.pawapay.callback_signature_rejected'
        )
      }
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
