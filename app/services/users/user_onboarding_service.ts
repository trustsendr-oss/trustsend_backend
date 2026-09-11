import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import User from '#models/user'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

/**
 * User Onboarding Service
 *
 * Creates user wallet (USD by default) and ledger account
 * Called when a new user signs up
 */
export class UserOnboardingService {
  /**
   * Create wallet for newly registered user
   * Initializes with USD currency by default
   */
  static async createDefaultWallet(
    userId: number,
    currencyCode: string = 'USD',
    correlationId?: string,
    externalTrx?: TransactionClientContract
  ): Promise<Wallet> {
    const run = async (trx: TransactionClientContract): Promise<Wallet> => {
      const user = await User.findOrFail(userId, { client: trx })

      // Check if wallet already exists for this currency
      const existingWallet = await Wallet.query({ client: trx })
        .where('user_id', userId)
        .where('currency_code', currencyCode)
        .first()

      if (existingWallet) {
        return existingWallet
      }

      // Create ledger account for user wallet
      const account = new LedgerAccount()
      account.code = `USER_WALLET.${user.id}.${currencyCode}`
      account.name = `${currencyCode} wallet for user ${user.fullName || user.email}`
      account.accountType = 'asset'
      account.ownerType = 'user_wallet'
      account.currencyCode = currencyCode
      account.status = 'active'

      await account.useTransaction(trx).save()

      // Create wallet
      const wallet = new Wallet()
      wallet.userId = userId
      wallet.ledgerAccountId = account.id
      wallet.currencyCode = currencyCode
      wallet.balanceCache = 0n
      wallet.status = 'active'

      await wallet.useTransaction(trx).save()

      // Update account to reference wallet
      account.ownerId = wallet.id
      await account.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'wallet.created',
        resourceType: 'wallet',
        resourceId: wallet.id,
        before: undefined,
        after: {
          user_id: userId,
          currency_code: currencyCode,
          status: wallet.status,
        },
        correlationId: correlationId || 'unknown',
      })

      return wallet
    }

    if (externalTrx) {
      return run(externalTrx)
    }
    return db.transaction(run)
  }
}
