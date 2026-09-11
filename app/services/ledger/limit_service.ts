import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export class TransactionLimitExceededException extends Error {
  constructor(walletId: number, limitType: string, limit: bigint, requested: bigint) {
    super(`Wallet ${walletId} ${limitType} limit exceeded: limit ${limit}, requested ${requested}`)
    this.name = 'TransactionLimitExceededException'
  }
}

interface LimitCheckWallet {
  id: number
  ledgerAccountId: number
  dailyLimit: bigint | null
  monthlyLimit: bigint | null
}

/**
 * Enforces wallets.daily_limit / wallets.monthly_limit, which existed on the schema and were
 * exposed read-only via the wallets API but never actually checked anywhere.
 *
 * Takes explicit fields rather than a Lucid `Wallet` instance so it works equally whether the
 * caller loaded the wallet via the ORM (camelCase) or via a raw db.query() row (snake_case) —
 * callers must map their own row shape to this interface explicitly, rather than the two
 * silently drifting apart.
 */
export class LimitService {
  static async assertWithinLimits(
    wallet: LimitCheckWallet,
    amount: bigint,
    trx: TransactionClientContract
  ): Promise<void> {
    if (wallet.dailyLimit) {
      await this.assertWithinWindow(
        wallet,
        amount,
        DateTime.now().startOf('day').toJSDate(),
        wallet.dailyLimit,
        'daily',
        trx
      )
    }

    if (wallet.monthlyLimit) {
      await this.assertWithinWindow(
        wallet,
        amount,
        DateTime.now().startOf('month').toJSDate(),
        wallet.monthlyLimit,
        'monthly',
        trx
      )
    }
  }

  private static async assertWithinWindow(
    wallet: LimitCheckWallet,
    amount: bigint,
    since: Date,
    limit: bigint,
    limitType: string,
    trx: TransactionClientContract
  ): Promise<void> {
    const result = await db
      .query()
      .from('ledger_entries')
      .where('ledger_account_id', wallet.ledgerAccountId)
      .where('direction', 'debit')
      .where('created_at', '>=', since)
      .sum('amount as total')
      .useTransaction(trx)
      .first()

    const alreadySpent = BigInt(result?.total || 0)
    const projected = alreadySpent + amount

    if (projected > limit) {
      throw new TransactionLimitExceededException(wallet.id, limitType, limit, projected)
    }
  }
}
