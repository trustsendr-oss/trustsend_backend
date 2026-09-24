import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import LedgerTransaction from '#models/ledger_transaction'
import { CryptoDepositService } from '#services/crypto/crypto_deposit_service'
import { createCryptoDepositAddressValidator } from '#validators/crypto'

export default class CryptoDepositsController {
  /**
   * POST /api/v1/crypto/deposits/address
   * Generate or retrieve a crypto deposit address for the authenticated user.
   */
  async address({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCryptoDepositAddressValidator)
    const currencyCode = payload.currency_code || 'USD'
    const network = payload.network
    const tokenSymbol = payload.token_symbol || 'USDC'

    const wallet = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', user.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()

    if (!wallet) {
      return response.notFound({
        message: `Active wallet not found for currency ${currencyCode}. Please open a ${currencyCode} wallet first.`,
      })
    }

    const depositAddress = await CryptoDepositService.getOrCreateDepositAddress({
      userId: user.id,
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
   * GET /api/v1/crypto/deposits
   * List crypto deposits for authenticated user.
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const transactions = await LedgerTransaction.query()
      .where('initiated_by_type', 'user')
      .where('initiated_by_id', user.id)
      .where('type', 'crypto_deposit')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    return response.ok({
      data: transactions.all(),
      meta: transactions.getMeta(),
    })
  }
}
