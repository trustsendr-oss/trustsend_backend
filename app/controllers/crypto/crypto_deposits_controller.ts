import type { HttpContext } from '@adonisjs/core/http'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { availableDepositRails } from '#services/crypto/crypto_networks'
import { createCryptoDepositAddressValidator } from '#validators/crypto'
import {
  depositAddressPayload,
  respondToDepositError,
} from '#controllers/crypto/crypto_deposit_responses'

export default class CryptoDepositsController {
  /**
   * GET /api/v1/crypto/deposits/options
   * The (network, token) pairs a deposit address can be requested for right now. A network
   * Alchemy does not watch is absent: offering it would let money in that never gets credited.
   */
  async options({ response }: HttpContext) {
    // Taken from each deposit when it is credited; the app shows it before the user sends.
    const feeBps = Math.round((await FeeScheduleService.getFeePercent('crypto_deposit')) * 100)
    return response.ok({
      data: availableDepositRails().map((rail) => ({
        network: rail.network,
        token_symbol: rail.tokenSymbol,
        currency_code: rail.currencyCode,
        required_confirmations: rail.confirmations,
        // Non-null in the sandbox: the app labels the rail as a test network.
        testnet_name: rail.testnetName,
        fee_bps: feeBps,
      })),
    })
  }

  /**
   * POST /api/v1/crypto/deposits/address
   * The authenticated user's deposit address for a network and token, created on first request.
   */
  async address({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCryptoDepositAddressValidator)
    try {
      const { address, wallet } = await CryptoDepositService.requestAddress({
        owner: { type: 'user', id: user.id },
        network: payload.network,
        tokenSymbol: payload.token_symbol,
        currencyCode: payload.currency_code,
      })
      return response.ok({ data: depositAddressPayload(address, wallet) })
    } catch (error) {
      return respondToDepositError(error, response)
    }
  }

  /**
   * GET /api/v1/crypto/deposits
   * The user's crypto deposits, including those still waiting for confirmations.
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const page = Number(request.input('page', 1)) || 1
    const limit = Math.min(Number(request.input('limit', 20)) || 20, 100)
    return response.ok(
      await CryptoDepositService.listFor({ type: 'user', id: user.id }, page, limit)
    )
  }
}
