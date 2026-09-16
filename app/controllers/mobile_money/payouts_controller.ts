import type { HttpContext } from '@adonisjs/core/http'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { MobileMoneyPayoutService } from '#services/mobile_money/mobile_money_payout_service'
import { PawaPayProvider, amountStepFor } from '#services/mobile_money/pawapay_provider'
import { createMobileMoneyPayoutValidator } from '#validators/mobile_money'
import Wallet from '#models/wallet'

const provider = new PawaPayProvider()

const PAYOUT_ENDPOINT = 'POST /api/v1/mobile-money/payouts'

export default class MobileMoneyPayoutsController {
  /**
   * POST /api/v1/mobile-money/payouts
   * User transfers from their wallet out to mobile money — no agent involved.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createMobileMoneyPayoutValidator)
    const currencyCode = payload.currency_code || 'USD'

    let providerConfig
    try {
      providerConfig = await provider.getProviderConfig(currencyCode, payload.provider, 'PAYOUT')
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
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: PAYOUT_ENDPOINT,
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
      const userWallet = await Wallet.query()
        .where('user_id', user.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()

      if (!userWallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `Active wallet not found for currency ${currencyCode}`,
        })
      }

      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const amount = new Money(BigInt(payload.amount), currencyCode)
      const correlationId = (request as any).correlationId || 'unknown'

      const txn = await MobileMoneyPayoutService.initiate(provider, {
        initiatedByType: 'user',
        initiatedById: user.id,
        walletId: userWallet.id,
        amount,
        phoneNumber: payload.phone_number,
        providerCode: payload.provider,
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          payout_id: txn.id,
          status: txn.status,
          created_at: txn.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 202, body)
      return response.status(202).send(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'InsufficientBalanceException') {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'TransactionLimitExceededException') {
        return response.badRequest({ message: err.message })
      }
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message: 'Mobile money provider unavailable, try again',
        })
      }
      if (err.name === 'ValidationException') {
        return response.unprocessableEntity({ message: err.message })
      }
      return response.internalServerError({ message: 'Mobile money payout failed' })
    }
  }

  /**
   * GET /api/v1/mobile-money/payouts/:id
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const txn = await MobileMoneyPayoutService.getByIdForInitiator(params.id, 'user', user.id)
      return response.ok({
        data: {
          payout_id: txn.id,
          status: txn.status,
          created_at: txn.createdAt,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'MobileMoneyPayoutOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      return response.notFound({ message: 'Payout not found' })
    }
  }

  /**
   * GET /api/v1/mobile-money/payouts/:id/live-status
   * Bypasses our stored status and asks PawaPay directly, right now — useful when the
   * reconciliation sweep (mobile-money:reconcile) hasn't caught up yet, or to debug a stuck
   * transaction, without waiting for the next sweep or a callback.
   */
  async liveStatus({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const txn = await MobileMoneyPayoutService.getByIdForInitiator(params.id, 'user', user.id)
      const live = await provider.checkPayoutStatus(txn.providerReferenceId!)

      // A final status means PawaPay considers this settled — apply it now via the same
      // idempotent path the webhook/reconciliation sweep use, instead of just reporting a
      // stale local status back to the caller.
      const updated =
        live.status === 'COMPLETED' || live.status === 'FAILED'
          ? await MobileMoneyPayoutService.confirmFromCallback(
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
          payout_id: updated.id,
          local_status: updated.status,
          live_status: live.status,
          provider_transaction_id: live.providerTransactionId,
          failure_reason: live.failureReason,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'MobileMoneyPayoutOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message:
            'Mobile money provider unavailable, or has no record of this payout yet, try again',
        })
      }
      if (err.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Payout not found' })
      }
      // Anything else (e.g. a bug in confirmFromCallback's posting logic) is a real failure —
      // never relabel it as "not found", that hides the actual problem from whoever's debugging.
      throw error
    }
  }
}
