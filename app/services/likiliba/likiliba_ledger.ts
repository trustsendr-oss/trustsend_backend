import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LedgerAccount from '#models/ledger_account'
import Wallet from '#models/wallet'
import type Likiliba from '#models/likiliba'
import type LedgerTransaction from '#models/ledger_transaction'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'
import { LikilibaException, type LikilibaActor } from '#services/likiliba/shared'

export type LikilibaTransactionType =
  | 'likiliba_caution_lock'
  | 'likiliba_contribution'
  | 'likiliba_caution_cover'
  | 'likiliba_penalty'
  | 'likiliba_debt_repayment'
  | 'likiliba_payout'
  | 'likiliba_caution_release'
  | 'likiliba_refund'

export type LikilibaLeg = { walletId: number; direction: 'debit' | 'credit'; amount: bigint }

/**
 * The only door between a likiliba and the ledger. It adds nothing to LedgerService's
 * guarantees; it applies, once, the checks every debit from a member's own wallet needs
 * (available balance, cash-out holds, per-transaction and daily/monthly limits) and locks every
 * wallet a movement touches in ascending id order, so two groups moving money for the same
 * person can never deadlock.
 */
export class LikilibaLedger {
  /** The pot: an escrow wallet owned by the group, not by any person. */
  static async createPotWallet(
    likiliba: Likiliba,
    trx: TransactionClientContract
  ): Promise<Wallet> {
    const account = new LedgerAccount()
    account.code = `LIKILIBA_POT.${likiliba.code}.${likiliba.currencyCode}`
    account.name = `Pot of likiliba ${likiliba.code} (${likiliba.currencyCode})`
    account.accountType = 'asset'
    account.ownerType = 'likiliba_pot'
    account.currencyCode = likiliba.currencyCode
    account.status = 'active'
    await account.useTransaction(trx).save()

    const wallet = new Wallet()
    wallet.likilibaId = likiliba.id
    wallet.userId = null
    wallet.agentId = null
    wallet.businessId = null
    wallet.ledgerAccountId = account.id
    wallet.currencyCode = likiliba.currencyCode
    wallet.balanceCache = 0n
    wallet.purpose = 'escrow'
    wallet.status = 'active'
    await wallet.useTransaction(trx).save()

    account.ownerId = wallet.id
    await account.useTransaction(trx).save()
    return wallet
  }

  /**
   * A member's caution: a collateral wallet in their own name. Not `primary`, so no spending path
   * can ever resolve it (see Wallet.purpose).
   */
  static async createCautionWallet(
    likiliba: Likiliba,
    userId: number,
    trx: TransactionClientContract
  ): Promise<Wallet> {
    const account = new LedgerAccount()
    account.code = `LIKILIBA_CAUTION.${likiliba.code}.${userId}.${likiliba.currencyCode}`
    account.name = `Caution of user ${userId} in likiliba ${likiliba.code}`
    account.accountType = 'asset'
    account.ownerType = 'user_wallet'
    account.currencyCode = likiliba.currencyCode
    account.status = 'active'
    await account.useTransaction(trx).save()

    const wallet = new Wallet()
    wallet.userId = userId
    wallet.ledgerAccountId = account.id
    wallet.currencyCode = likiliba.currencyCode
    wallet.balanceCache = 0n
    wallet.purpose = 'collateral'
    wallet.status = 'active'
    await wallet.useTransaction(trx).save()

    account.ownerId = wallet.id
    await account.useTransaction(trx).save()
    return wallet
  }

  /** Locks the wallets in ascending id order and returns them by id. */
  static async lockWallets(
    ids: number[],
    trx: TransactionClientContract
  ): Promise<Map<number, Wallet>> {
    const unique = [...new Set(ids)].sort((a, b) => a - b)
    const wallets = await Wallet.query({ client: trx })
      .whereIn('id', unique)
      .orderBy('id', 'asc')
      .forUpdate()
    return new Map(wallets.map((w) => [w.id, w]))
  }

  static async balanceOf(walletId: number, trx?: TransactionClientContract): Promise<bigint> {
    const query = db.from('wallets').where('id', walletId).select('balance_cache')
    if (trx) query.useTransaction(trx)
    const row = await query.first()
    return BigInt(row?.balance_cache ?? 0)
  }

  /**
   * Every check a debit from a member's primary wallet must pass. Called with the wallet already
   * locked, so the answer cannot change before the debit posts.
   */
  static async assertCanDebit(wallet: Wallet, amount: bigint, trx: TransactionClientContract) {
    if (wallet.status !== 'active') {
      throw new LikilibaException('This account is not active', 'WALLET_INACTIVE', 409)
    }
    if (wallet.balanceCache < amount) {
      throw new LikilibaException('Insufficient balance', 'INSUFFICIENT_FUNDS', 402)
    }
    try {
      await CashOutHoldService.assertAvailable(wallet, amount, trx)
    } catch (error) {
      if ((error as Error).name === 'FundsReservedException') {
        throw new LikilibaException(
          'Part of this balance is reserved for a pending cash withdrawal',
          'FUNDS_RESERVED',
          402
        )
      }
      throw error
    }
    if (wallet.perTransactionLimit && amount > wallet.perTransactionLimit) {
      throw new LikilibaException(
        'This amount is above your per-transaction limit',
        'LIMIT_EXCEEDED',
        400
      )
    }
    try {
      await LimitService.assertWithinLimits(
        {
          id: wallet.id,
          ledgerAccountId: wallet.ledgerAccountId,
          dailyLimit: wallet.dailyLimit,
          monthlyLimit: wallet.monthlyLimit,
        },
        amount,
        trx
      )
    } catch (error) {
      if ((error as Error).name === 'TransactionLimitExceededException') {
        throw new LikilibaException((error as Error).message, 'LIMIT_EXCEEDED', 400)
      }
      throw error
    }
  }

  /**
   * Posts one balanced movement. Legs name wallets; the platform's commission account is passed
   * separately because it backs no wallet.
   */
  static async post(params: {
    type: LikilibaTransactionType
    likiliba: Likiliba
    legs: LikilibaLeg[]
    commission?: bigint
    actor: LikilibaActor
    description: string
    metadata: Record<string, any>
    correlationId: string
    idempotencyKey?: string
    trx: TransactionClientContract
  }): Promise<LedgerTransaction> {
    const { likiliba, trx } = params
    const currency = likiliba.currencyCode
    const wallets = await this.lockWallets(
      params.legs.map((l) => l.walletId),
      trx
    )

    const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = []
    for (const leg of params.legs) {
      if (leg.amount <= 0n) continue
      const wallet = wallets.get(leg.walletId)
      if (!wallet) throw new Error(`Wallet ${leg.walletId} not found`)
      if (wallet.currencyCode !== currency) {
        throw new LikilibaException(
          `Wallet ${wallet.id} is in ${wallet.currencyCode}, this likiliba is in ${currency}`,
          'CURRENCY_MISMATCH',
          409
        )
      }
      entries.push({
        accountId: wallet.ledgerAccountId,
        direction: leg.direction,
        amount: new Money(leg.amount, currency),
      })
    }

    if (params.commission && params.commission > 0n) {
      const revenue = await LedgerService.getOrCreatePlatformAccount(
        `LIKILIBA_FEES.${currency}`,
        `Likiliba payout commissions (${currency})`,
        currency,
        trx,
        'revenue'
      )
      entries.push({
        accountId: revenue.id,
        direction: 'credit',
        amount: new Money(params.commission, currency),
      })
    }

    const moved = entries
      .filter((e) => e.direction === 'debit')
      .reduce((sum, e) => sum + e.amount.amount, 0n)

    // A member-initiated movement is posted as theirs, so LedgerService's cash-out hold backstop
    // applies; the scheduler posts as `system`, having run the same checks itself.
    return LedgerService.postTransaction(
      params.type,
      entries,
      params.actor.type === 'user' ? 'user' : params.actor.type,
      params.actor.id,
      {
        correlationId: params.correlationId,
        idempotencyKey: params.idempotencyKey,
        description: params.description,
        metadata: { likiliba_id: likiliba.id, likiliba_code: likiliba.code, ...params.metadata },
        amount: new Money(moved, currency),
        fee: params.commission && params.commission > 0n ? params.commission : undefined,
        paymentMethod: 'wallet',
        paymentChannel: 'likiliba',
        trx,
      }
    )
  }
}
