import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import LedgerTransaction from '#models/ledger_transaction'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { CryptoPayoutService } from '#services/crypto/crypto_payout_service'
import { availablePayoutRails, TOKEN_CURRENCY } from '#services/crypto/crypto_networks'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { createCryptoPayoutValidator } from '#validators/crypto'

const CRYPTO_PAYOUT_ENDPOINT = 'POST /api/v1/crypto/payouts'

export default class CryptoPayoutsController {
  /**
   * GET /api/v1/crypto/payouts/options
   * Networks and tokens a withdrawal can go out on, with their network fee and minimum (cents).
   */
  async options({ response }: HttpContext) {
    // Percentage taken on the amount, as basis points (200 = 2 %), on top of the network fee.
    const feeBps = Math.round((await FeeScheduleService.getFeePercent('crypto_payout')) * 100)
    return response.ok({
      data: availablePayoutRails().map((rail) => ({
        fee_bps: feeBps,
        network: rail.network,
        token_symbol: rail.tokenSymbol,
        currency_code: rail.currencyCode,
        network_fee: rail.networkFee.toString(),
        min_amount: rail.minAmount.toString(),
        required_confirmations: rail.confirmations,
        testnet_name: rail.testnetName,
      })),
    })
  }

  /**
   * GET /api/v1/crypto/payouts
   * The user's crypto withdrawals, newest first.
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }
    const page = Number(request.input('page', 1)) || 1
    const limit = Math.min(Number(request.input('limit', 20)) || 20, 100)
    const result = await LedgerTransaction.query()
      .where('initiated_by_type', 'user')
      .where('initiated_by_id', user.id)
      .where('type', 'crypto_payout')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
    return response.ok({
      data: result.all().map((txn) => CryptoPayoutService.present(txn)),
      meta: result.getMeta(),
    })
  }

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
    // The token decides the account: USDT and USDC leave a USD account, EURC a EUR one.
    const currencyCode = TOKEN_CURRENCY[payload.token_symbol] ?? payload.currency_code ?? 'USD'
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

      // Reviewed by staff before anything leaves: `pending` until they send it.
      const responseBody = {
        message: 'Crypto withdrawal requested: it will be reviewed and sent shortly',
        data: { transaction_id: txn.id, ...CryptoPayoutService.present(txn) },
      }

      await IdempotencyService.complete(identity, 201, responseBody)
      return response.created(responseBody)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'CryptoPayoutException') {
        return response.status(err.status).send({ code: err.code, message: err.message })
      }
      if (err.name === 'InsufficientCryptoBalanceException') {
        return response.unprocessableEntity({ code: 'INSUFFICIENT_FUNDS', message: err.message })
      }
      if (err.name === 'FundsReservedException' || err.name === 'LimitExceededException') {
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

    return response.ok({ data: CryptoPayoutService.present(txn) })
  }
}
