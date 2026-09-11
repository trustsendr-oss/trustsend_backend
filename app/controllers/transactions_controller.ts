import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import { WalletStatementService } from '#services/transactions/wallet_statement_service'

/**
 * Transactions Controller — a single movement, whichever wallet it touched.
 *
 * The statement route is per-wallet, which is right for a list but wrong for a receipt: a
 * receipt is opened from a notification, a share link or a completed transfer, none of which
 * knows a wallet id. This resolves the caller's wallets itself and looks the movement up across
 * all of them.
 */
export default class TransactionsController {
  /**
   * GET /api/v1/transactions/:id
   *
   * Accepts the internal id (`TXN-XXXXXXXX`) or the public uuid, since callers hold one or the
   * other depending on where they came from.
   *
   * There is no separate ownership check: the lookup is scoped to the caller's own wallets, so a
   * transaction that touched none of them is simply not found. An explicit check is one that can
   * be forgotten; a scope cannot.
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const wallets = await Wallet.query().where('user_id', user.id).select('id')

    const transaction = await WalletStatementService.find({
      walletIds: wallets.map((wallet) => wallet.id),
      transactionId: params.id,
    })

    if (!transaction) {
      return response.notFound({ message: 'Transaction not found' })
    }

    return response.ok({ data: transaction })
  }
}
