import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LedgerTransaction from '#models/ledger_transaction'
import LedgerEntry from '#models/ledger_entry'
import LedgerAccount from '#models/ledger_account'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { IdGenerator } from '#services/security/id_generator'
import { v4 as uuidv4 } from 'uuid'

/**
 * LedgerService — The single point of truth for all accounting operations
 *
 * Principles:
 * 1. NEVER mutate wallets balance directly — only through this service
 * 2. ALWAYS use transactions (db.transaction()) to ensure atomic consistency
 * 3. ALWAYS verify double-entry: sum(debits) = sum(credits)
 * 4. ALWAYS use Money value objects — never raw bigints or floats
 * 5. ALWAYS snapshot balance_after on each entry
 *
 * This is the firewall that prevents bugs from destroying financial integrity.
 */
export class LedgerService {
  /**
   * Post a complete double-entry transaction.
   *
   * @param type - Transaction type (p2p_transfer, cash_in, etc.)
   * @param entries - Array of [account_id, direction, amount] tuples
   * @param initiatedByType - Who initiated (user, agent, system)
   * @param initiatedById - ID of the initiator
   * @param options.trx - An existing transaction to post into. When the caller already holds a
   *   transaction (e.g. after locking wallet rows with forUpdate()), it MUST pass it here so this
   *   method runs on the SAME connection instead of opening an independent db.transaction(). Two
   *   separate connections both trying to update the same locked wallet row deadlocks the request.
   * @returns The created LedgerTransaction
   *
   * Throws if:
   * - Entries don't balance (sum debits ≠ sum credits)
   * - Any referenced account doesn't exist
   * - Any amount is invalid
   */
  static async postTransaction(
    type: string,
    entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }>,
    initiatedByType: 'user' | 'agent' | 'system' | 'internal_user' | 'business',
    initiatedById: number,
    options: {
      idempotencyKey?: string
      correlationId: string
      description?: string
      metadata?: Record<string, any>
      reversalOfTransactionId?: string
      transactionId?: string // Optional: use existing transaction ID
      trx?: TransactionClientContract
      // Display/filter convenience columns — see migration
      // 1793400000000_add_payment_detail_columns_to_ledger_transactions.ts. Never used for the
      // double-entry math above; purely copied onto the created row for admin/API consumption.
      amount?: Money
      paymentMethod?: string
      paymentChannel?: string
      counterpartyPhone?: string
      fee?: bigint
      relatedTransactionId?: string
    }
  ): Promise<LedgerTransaction> {
    const run = async (trx: TransactionClientContract): Promise<LedgerTransaction> => {
      // Verify double-entry constraint
      const totalDebits = entries
        .filter((e) => e.direction === 'debit')
        .reduce((sum, e) => sum + e.amount.amount, 0n)

      const totalCredits = entries
        .filter((e) => e.direction === 'credit')
        .reduce((sum, e) => sum + e.amount.amount, 0n)

      if (totalDebits !== totalCredits) {
        throw new Error(
          `Double-entry violation: debits (${totalDebits}) ≠ credits (${totalCredits})`
        )
      }

      // A multi-currency transaction (fx_swap) must also balance within each currency: amounts
      // in different currencies can never offset each other.
      const netByCurrency = new Map<string, bigint>()
      for (const e of entries) {
        const signed = e.direction === 'debit' ? e.amount.amount : -e.amount.amount
        netByCurrency.set(
          e.amount.currencyCode,
          (netByCurrency.get(e.amount.currencyCode) ?? 0n) + signed
        )
      }
      for (const [currencyCode, net] of netByCurrency) {
        if (net !== 0n) {
          throw new Error(`Double-entry violation: ${currencyCode} entries are off by ${net}`)
        }
      }

      // Create the transaction envelope
      const txn = new LedgerTransaction()
      txn.id = options.transactionId || IdGenerator.generateTransactionId() // TXN-XXXXXXXX
      txn.uuid = uuidv4()
      txn.type = type
      txn.status = 'completed' // For Phase 1, transactions complete immediately
      txn.idempotencyKey = options.idempotencyKey || null
      txn.correlationId = options.correlationId
      txn.initiatedByType = initiatedByType
      txn.initiatedById = initiatedById
      txn.reversalOfTransactionId = options.reversalOfTransactionId || null
      txn.description = options.description || null
      txn.metadata = options.metadata || null
      txn.amount = options.amount?.amount ?? null
      txn.currencyCode = options.amount?.currencyCode ?? null
      txn.paymentMethod = options.paymentMethod || null
      txn.paymentChannel = options.paymentChannel || null
      txn.counterpartyPhone = options.counterpartyPhone || null
      txn.fee = options.fee ?? null
      txn.relatedTransactionId = options.relatedTransactionId || null

      await txn.useTransaction(trx).save()

      // Create entries and update wallet balances
      for (const entry of entries) {
        // Get the account and its wallet (if it has one) — must read on the SAME connection/trx
        // so it sees accounts created earlier in this same transaction (e.g. lazily-created
        // platform accounts) and so its result is consistent with the locks held below.
        const account = await db
          .query()
          .from('ledger_accounts')
          .where('id', entry.accountId)
          .useTransaction(trx)
        if (account.length === 0) {
          throw new Error(`Account ${entry.accountId} not found`)
        }

        // Calculate balance after this entry
        let balanceAfter = 0n

        // If this account has a corresponding wallet, update its balance cache
        if (
          account[0].owner_type === 'user_wallet' ||
          account[0].owner_type === 'agent_wallet' ||
          account[0].owner_type === 'business_wallet'
        ) {
          const walletId = account[0].owner_id
          if (walletId) {
            // Pessimistic lock: prevents a lost update if two transactions touch this wallet
            // concurrently (must be posted on `trx`, never a separate connection).
            const wallet = await Wallet.query({ client: trx })
              .where('id', walletId)
              .forUpdate()
              .firstOrFail()

            // Update balance based on direction
            if (entry.direction === 'debit') {
              wallet.balanceCache = wallet.balanceCache - entry.amount.amount
            } else {
              wallet.balanceCache = wallet.balanceCache + entry.amount.amount
            }

            // Prevent negative balances (application-level check)
            if (wallet.balanceCache < 0n) {
              throw new Error(`Wallet ${walletId} balance would go negative`)
            }

            await wallet.useTransaction(trx).save()
            balanceAfter = wallet.balanceCache
          }
        } else {
          // For accounts without wallets (like platform revenue/reserve accounts), calculate
          // from previous entries. Note: unlike wallet balances, this running total isn't
          // protected by a row lock (SELECT ... FOR UPDATE can't lock rows that don't exist
          // yet), so it's a best-effort display value, not an authoritative balance.
          const lastEntry = await db
            .query()
            .from('ledger_entries')
            .where('ledger_account_id', entry.accountId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .useTransaction(trx)
            .first()

          const balanceBefore = lastEntry?.balanceAfter || 0n
          if (entry.direction === 'debit') {
            balanceAfter = balanceBefore - entry.amount.amount
          } else {
            balanceAfter = balanceBefore + entry.amount.amount
          }
        }

        // Create ledger entry with proper balance snapshot
        const ledgerEntry = new LedgerEntry()
        ledgerEntry.id = IdGenerator.generateLedgerId() // LDG-XXXXXXXX
        ledgerEntry.ledgerTransactionId = txn.id
        ledgerEntry.ledgerAccountId = entry.accountId
        ledgerEntry.direction = entry.direction
        ledgerEntry.amount = entry.amount.amount
        ledgerEntry.currencyCode = entry.amount.currencyCode
        ledgerEntry.balanceAfter = balanceAfter

        await ledgerEntry.useTransaction(trx).save()
      }

      return txn
    }

    if (options.trx) {
      return run(options.trx)
    }
    return db.transaction(run)
  }

  /**
   * Get an existing platform-internal ledger account by code, or create it if missing.
   * Used for accounts that don't back a specific wallet (fees, reserves).
   * Must be called with the SAME trx that will later be passed to postTransaction, so the
   * newly created account is visible within that transaction (see postTransaction's account
   * lookup, which reads via `.useTransaction(trx)`).
   */
  static async getOrCreatePlatformAccount(
    code: string,
    name: string,
    currencyCode: string,
    trx: TransactionClientContract,
    accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' = 'asset'
  ): Promise<{ id: number }> {
    const existing = await db
      .query()
      .from('ledger_accounts')
      .where('code', code)
      .useTransaction(trx)
      .first()

    if (existing) {
      return { id: existing.id }
    }

    const inserted = await db
      .table('ledger_accounts')
      .useTransaction(trx)
      .insert({
        code,
        name,
        account_type: accountType,
        owner_type: 'platform_internal',
        owner_id: null,
        currency_code: currencyCode,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('id')

    return { id: inserted[0].id ?? inserted[0] }
  }

  /**
   * Reverse a completed transaction: posts a new transaction with every entry's direction
   * flipped, and marks the original as `reversed`. Used by dispute resolution.
   */
  static async reverseTransaction(
    originalTransactionId: string,
    initiatedByType: 'user' | 'agent' | 'system' | 'internal_user' | 'business',
    initiatedById: number,
    options: {
      correlationId: string
      description?: string
      trx?: TransactionClientContract
    }
  ): Promise<LedgerTransaction> {
    const run = async (trx: TransactionClientContract): Promise<LedgerTransaction> => {
      const original = await LedgerTransaction.query({ client: trx })
        .where('id', originalTransactionId)
        .firstOrFail()

      if (original.status !== 'completed') {
        throw new Error(`Only completed transactions can be reversed (status: ${original.status})`)
      }

      const existingReversal = await LedgerTransaction.query({ client: trx })
        .where('reversal_of_transaction_id', originalTransactionId)
        .first()

      if (existingReversal) {
        throw new Error('Transaction has already been reversed')
      }

      const originalEntries = await LedgerEntry.query({ client: trx }).where(
        'ledger_transaction_id',
        originalTransactionId
      )

      if (originalEntries.length === 0) {
        throw new Error(`No ledger entries found for transaction ${originalTransactionId}`)
      }

      const reversedEntries = originalEntries.map((entry) => ({
        accountId: entry.ledgerAccountId,
        direction: (entry.direction === 'debit' ? 'credit' : 'debit') as 'debit' | 'credit',
        amount: new Money(entry.amount, entry.currencyCode),
      }))

      const reversalTxn = await this.postTransaction(
        `${original.type}_reversal`,
        reversedEntries,
        initiatedByType,
        initiatedById,
        {
          correlationId: options.correlationId,
          description: options.description || `Reversal of ${originalTransactionId}`,
          reversalOfTransactionId: originalTransactionId,
          trx,
        }
      )

      original.status = 'reversed'
      original.reversedAt = DateTime.now()
      await original.useTransaction(trx).save()

      return reversalTxn
    }

    if (options.trx) {
      return run(options.trx)
    }
    return db.transaction(run)
  }

  /**
   * Two independent integrity checks, run on demand (not scheduled — see
   * admin/accounting_controller.ts, which is the only caller):
   *
   * 1. Per-wallet: `balance_cache` (the denormalized column every read-path actually uses) vs
   *    the real sum of that wallet's ledger_entries — catches drift from a bug or a direct DB
   *    edit that bypassed LedgerService.
   * 2. Ledger-wide, per currency: total debits vs total credits across EVERY entry. This is the
   *    fundamental double-entry invariant, already enforced per-transaction inside
   *    postTransaction() above — so this should never find an imbalance in practice, but a
   *    periodic full-ledger audit is what actually catches a bug in that enforcement, a partial
   *    migration, or a direct DB edit, none of which per-transaction validation can see.
   */
  static async reconcileBalances(): Promise<{
    walletsChecked: number
    walletMismatches: Array<{ walletId: number; expected: string; actual: string }>
    balancedByCurrency: Record<string, boolean>
    totalsByCurrency: Record<string, { debits: string; credits: string }>
  }> {
    const wallets = await Wallet.all()
    const walletMismatches: Array<{ walletId: number; expected: string; actual: string }> = []

    for (const wallet of wallets) {
      const result = await db
        .query()
        .from('ledger_entries as le')
        .join('ledger_accounts as la', 'le.ledger_account_id', 'la.id')
        .where('la.owner_id', wallet.id)
        .select(
          db.raw(
            "SUM(CASE WHEN le.direction = 'debit' THEN -le.amount ELSE le.amount END) as net_balance"
          )
        )
        .first()

      // db.query() is the raw query builder (not a Lucid Model), so its rows keep whatever
      // column/alias name Postgres actually returns — snake_case here, never auto-camelCased.
      const calculatedBalance = BigInt(result?.net_balance || 0)

      if (calculatedBalance !== wallet.balanceCache) {
        walletMismatches.push({
          walletId: wallet.id,
          expected: calculatedBalance.toString(),
          actual: wallet.balanceCache.toString(),
        })
      }
    }

    const perCurrency = await db
      .query()
      .from('ledger_entries')
      .select('currency_code')
      .sum({ debits: db.raw("CASE WHEN direction = 'debit' THEN amount ELSE 0 END") })
      .sum({ credits: db.raw("CASE WHEN direction = 'credit' THEN amount ELSE 0 END") })
      .groupBy('currency_code')

    const balancedByCurrency: Record<string, boolean> = {}
    const totalsByCurrency: Record<string, { debits: string; credits: string }> = {}
    for (const row of perCurrency as any[]) {
      const debits = BigInt(row.debits || 0)
      const credits = BigInt(row.credits || 0)
      balancedByCurrency[row.currency_code] = debits === credits
      totalsByCurrency[row.currency_code] = {
        debits: debits.toString(),
        credits: credits.toString(),
      }
    }

    return {
      walletsChecked: wallets.length,
      walletMismatches,
      balancedByCurrency,
      totalsByCurrency,
    }
  }

  /**
   * True accounting balance of a platform-internal account (fees, clearing, reserves) derived
   * from its ledger entries — these accounts have no cached balance column like wallets do
   * (see the "best-effort" note in postTransaction above), so this is the authoritative way to
   * read one. Asset/expense accounts grow on debit; liability/equity/revenue accounts grow on
   * credit — get the sign wrong and every clearing-account reconciliation reads backwards.
   * Returns 0n if the account doesn't exist yet (never created because no transaction touched it).
   */
  static async getAccountBalance(code: string): Promise<bigint> {
    const account = await LedgerAccount.query().where('code', code).first()
    if (!account) return 0n

    const result = await db
      .query()
      .from('ledger_entries')
      .where('ledger_account_id', account.id)
      .select(
        db.raw("SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) as net_balance")
      )
      .first()

    const netOnDebitPositiveConvention = BigInt(result?.netBalance || 0)
    const growsOnDebit = account.accountType === 'asset' || account.accountType === 'expense'
    return growsOnDebit ? netOnDebitPositiveConvention : -netOnDebitPositiveConvention
  }
}
