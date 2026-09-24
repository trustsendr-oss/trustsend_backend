import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import Business from '#models/business'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { createCryptoDepositAddressValidator, createCryptoPayoutValidator } from '#validators/crypto'

const BIZ_CRYPTO_PAYOUT_ENDPOINT = 'POST /api/v1/business/crypto/payouts'

export default class BusinessCryptoController {
  /**
   * POST /api/v1/business/crypto/deposits/address
   * Generate or retrieve a crypto deposit address for the authenticated business.
   */
  async address({ auth, request, response }: HttpContext) {
    const business = auth.use('business_api_key').user || auth.use('business').user
    if (!business) {
      return response.unauthorized({ message: 'Unauthenticated business' })
    }

    const payload = await request.validateUsing(createCryptoDepositAddressValidator)
    const currencyCode = payload.currency_code || 'USD'
    const network = payload.network
    const tokenSymbol = payload.token_symbol || 'USDC'

    const wallet = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('business_id', business.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()

    if (!wallet) {
      return response.notFound({
        message: `Active wallet not found for currency ${currencyCode}`,
      })
    }

    const depositAddress = await CryptoDepositService.getOrCreateDepositAddress({
      businessId: business.id,
      walletId: wallet.id,
      network,
      tokenSymbol,
    })

    return response.ok({
      data: {
        network: depositAddress.network,
        token_symbol: depositAddress.tokenSymbol,
        address: depositAddress.address,
        memo_tag: depositAddress.memoTag,
        currency_code: wallet.currencyCode,
        wallet_id: wallet.id,
        created_at: depositAddress.createdAt,
      },
    })
  }

  /**
   * POST /api/v1/business/crypto/payouts
   * Request a crypto withdrawal from business wallet.
   */
  async payout({ auth, request, response }: HttpContext) {
    const business = auth.use('business_api_key').user || auth.use('business').user
    if (!business) {
      return response.unauthorized({ message: 'Unauthenticated business' })
    }

    const payload = await request.validateUsing(createCryptoPayoutValidator)
    const currencyCode = payload.currency_code || 'USD'
    const requestedAmount = BigInt(payload.amount)

    const identity = {
      key: payload.idempotency_key,
      actorType: 'business' as const,
      actorId: business.id,
      endpoint: BIZ_CRYPTO_PAYOUT_ENDPOINT,
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
      // 1. PIN check (if business has PIN configured)
      if (business.pinHash) {
        const pinResult = await PinService.verifyPin(business, payload.pin)
        if (!pinResult.valid) {
          await IdempotencyService.fail(identity)
          return response.unauthorized({
            message: pinResult.message,
            code: pinResult.code,
          })
        }
      }

      // 2. Find wallet
      const wallet = await Wallet.query()
        .withScopes((s) => s.primary())
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

      // 3. Initiate payout
      const correlationId = `biz-crypto-payout-${payload.idempotency_key}`
      const txn = await CryptoPayoutService.initiate({
        initiatedByType: 'business',
        initiatedById: business.id,
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
        message: 'Business crypto withdrawal initiated successfully',
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
}
