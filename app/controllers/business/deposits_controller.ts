import type { HttpContext } from '@adonisjs/core/http'
import { Money } from '#services/money/money'
import { IdempotencyService } from '#services/security/idempotency_service'
import { PinService } from '#services/security/pin_service'
import { MobileMoneyDepositService } from '#services/mobile_money/mobile_money_deposit_service'
import { PawaPayProvider, amountStepFor } from '#services/mobile_money/pawapay_provider'
import { createMobileMoneyDepositValidator } from '#validators/mobile_money'
import Wallet from '#models/wallet'

const provider = new PawaPayProvider()

const BUSINESS_DEPOSIT_ENDPOINT = 'POST /api/v1/business/mobile-money/deposits'

/**
 * Shared by both business access paths (see routes.ts): server-to-server via API key, and the
 * dashboard session. The API key call has no PIN prompt — the key itself is the sole credential
 * (business_api_key_middleware.ts) — but a dashboard session DOES require the business's PIN,
 * gated below on `businessAuthMethod` (set by whichever of the two middlewares authenticated
 * this request).
 */
export default class BusinessDepositsController {
  async store({ business, businessAuthMethod, request, response, correlationId }: HttpContext) {
    const payload = await request.validateUsing(createMobileMoneyDepositValidator)
    const currencyCode = payload.currency_code || 'USD'

    let providerConfig
    try {
      providerConfig = await provider.getProviderConfig(currencyCode, payload.provider, 'DEPOSIT')
    } catch (error) {
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message: 'Mobile money provider unavailable, try again',
        })
      }
      throw error
    }

    if (!providerConfig) {
      return response.unprocessableEntity({
        message: `Provider ${payload.provider} is not supported for currency ${currencyCode}`,
      })
    }
    if (providerConfig.status === 'CLOSED') {
      return response.serviceUnavailable({
        message: `${payload.provider} is currently unavailable, try another provider or again later`,
      })
    }

    const requestedAmount = BigInt(payload.amount)
    if (requestedAmount < providerConfig.minAmount || requestedAmount > providerConfig.maxAmount) {
      return response.unprocessableEntity({
        message: `Amount must be between ${providerConfig.minAmount} and ${providerConfig.maxAmount} (hundredths of the currency) for ${payload.provider}`,
      })
    }
    const amountStep = amountStepFor(providerConfig.decimalsInAmount)
    if (requestedAmount % amountStep !== 0n) {
      return response.unprocessableEntity({
        message: `${currencyCode} is paid in whole units with ${payload.provider}: the amount (hundredths) must be a multiple of ${amountStep}`,
      })
    }

    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: BUSINESS_DEPOSIT_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) {
        return response.status(outcome.status).send(outcome.body)
      }
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') {
        return response.conflict({ message: err.message })
      }
      throw error
    }

    try {
      const wallet = await Wallet.query()
        .where('business_id', business.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()

      if (!wallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `Active wallet not found for currency ${currencyCode}`,
        })
      }

      if (businessAuthMethod === 'dashboard') {
        const pinVerification = await PinService.verifyPin(business, payload.pin)
        if (!pinVerification.valid) {
          await IdempotencyService.fail(identity)
          return response.unauthorized({
            message: pinVerification.message,
            code: pinVerification.code,
          })
        }
      }

      const amount = new Money(BigInt(payload.amount), currencyCode)

      const txn = await MobileMoneyDepositService.initiate(provider, {
        initiatedByType: 'business',
        initiatedById: business.id,
        walletId: wallet.id,
        amount,
        phoneNumber: payload.phone_number,
        providerCode: payload.provider,
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          deposit_id: txn.id,
          status: txn.status,
          created_at: txn.createdAt,
          // Same as mobile_money/deposits_controller.ts — what the payer must do to authorise.
          authorization: providerConfig.authorization,
        },
      }
      await IdempotencyService.complete(identity, 202, body)
      return response.status(202).send(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message: 'Mobile money provider unavailable, try again',
        })
      }
      if (err.name === 'ValidationException') {
        return response.unprocessableEntity({ message: err.message })
      }
      return response.internalServerError({ message: 'Mobile money deposit failed' })
    }
  }

  async show({ business, params, response }: HttpContext) {
    try {
      const txn = await MobileMoneyDepositService.getByIdForInitiator(
        params.id,
        'business',
        business.id
      )
      return response.ok({
        data: {
          deposit_id: txn.id,
          status: txn.status,
          created_at: txn.createdAt,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'MobileMoneyDepositOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      return response.notFound({ message: 'Deposit not found' })
    }
  }

  /**
   * GET /api/v1/business/mobile-money/deposits/:id/live-status
   * Bypasses our stored status and asks PawaPay directly, right now.
   */
  async liveStatus({ business, params, response }: HttpContext) {
    try {
      const txn = await MobileMoneyDepositService.getByIdForInitiator(
        params.id,
        'business',
        business.id
      )
      const live = await provider.checkDepositStatus(txn.providerReferenceId!)

      // A final status means PawaPay considers this settled — apply it now via the same
      // idempotent path the webhook/reconciliation sweep use, instead of just reporting a
      // stale local status back to the caller.
      const updated =
        live.status === 'COMPLETED' || live.status === 'FAILED'
          ? await MobileMoneyDepositService.confirmFromCallback(
              provider.name,
              txn.providerReferenceId!,
              live.status,
              {
                providerTransactionId: live.providerTransactionId,
                failureReason: live.failureReason,
              }
            )
          : txn

      return response.ok({
        data: {
          deposit_id: updated.id,
          local_status: updated.status,
          live_status: live.status,
          provider_transaction_id: live.providerTransactionId,
          failure_reason: live.failureReason,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'MobileMoneyDepositOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message:
            'Mobile money provider unavailable, or has no record of this deposit yet, try again',
        })
      }
      if (err.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Deposit not found' })
      }
      // Anything else (e.g. a bug in confirmFromCallback's posting logic) is a real failure —
      // never relabel it as "not found", that hides the actual problem from whoever's debugging.
      throw error
    }
  }
}
