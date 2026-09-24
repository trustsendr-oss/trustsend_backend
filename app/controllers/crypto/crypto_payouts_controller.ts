import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import LedgerTransaction from '#models/ledger_transaction'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { createCryptoPayoutValidator } from '#validators/crypto'

const CRYPTO_PAYOUT_ENDPOINT = 'POST /api/v1/crypto/payouts'

export default class CryptoPayoutsController {
  /**
   * POST /api/v1/crypto/payouts
   * Request a crypto withdrawal from user's wallet.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCryptoPayoutValidator)
    const currencyCode = payload.currency_code || 'USD'
    const requestedAmount = BigInt(payload.amount)

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: CRYPTO_PAYOUT_ENDPOINT,
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
      // 1. PIN verification
      const pinResult = await PinService.verifyPin(user, payload.pin)
      if (!pinResult.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinResult.message,
          code: pinResult.code,
        })
      }

      // 2. Find active wallet
      const wallet = await Wallet.query()
        .withScopes((s) => s.primary())
        .where('user_id', user.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()

      if (!wallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `Active wallet not found for currency ${currencyCode}`,
        })
      }

      // 3. Initiate payout
      const correlationId = `crypto-payout-${payload.idempotency_key}`
      const txn = await CryptoPayoutService.initiate({
        initiatedByType: 'user',
        initiatedById: user.id,
        walletId: wallet.id,
        amount: requestedAmount,
        currencyCode,
        destinationAddress: payload.destination_address,
        network: payload.network,
        tokenSymbol: payload.token_symbol,
        memoTag: payload.memo_tag,
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const responseBody = {
        message: 'Crypto withdrawal initiated successfully',
        data: {
          transaction_id: txn.id,
          status: txn.status,
          amount: txn.amount?.toString(),
          currency_code: txn.currencyCode,
          fee: txn.fee?.toString(),
          payment_channel: txn.paymentChannel,
          destination_address: payload.destination_address,
          network: payload.network,
          token_symbol: payload.token_symbol,
          created_at: txn.createdAt,
        },
      }

      await IdempotencyService.complete(identity, 201, responseBody)
      return response.created(responseBody)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'InsufficientCryptoBalanceException' || err.name === 'LimitExceededException') {
        return response.unprocessableEntity({ message: err.message })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/crypto/payouts/:id
   * Get crypto payout details.
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const txn = await LedgerTransaction.query()
      .where('id', params.id)
      .where('initiated_by_type', 'user')
      .where('initiated_by_id', user.id)
      .where('type', 'crypto_payout')
      .first()

    if (!txn) {
      return response.notFound({ message: 'Crypto payout transaction not found' })
    }

    return response.ok({ data: txn })
  }
}
