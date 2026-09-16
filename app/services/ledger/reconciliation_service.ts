import db from '@adonisjs/lucid/services/db'
import Wallet from '#models/wallet'

/**
 * ReconciliationService — Detects drift between wallet balance_cache and ledger_entries
 *
 * Runs frequently (every 60 seconds) to ensure the accounting system hasn't diverged.
 * Any drift is an emergency: it means either a bug or an integrity violation.
 */
export class ReconciliationService {
  /**
   * Check all wallets for balance mismatches
   * Returns array of mismatches found
   */
  static async checkBalances(): Promise<
    Array<{
      walletId: number
      cachedBalance: bigint
      calculatedBalance: bigint
      difference: bigint
    }>
  > {
    const mismatches: Array<{
      walletId: number
      cachedBalance: bigint
      calculatedBalance: bigint
      difference: bigint
    }> = []

    const wallets = await Wallet.all()

    for (const wallet of wallets) {
      // Calculate balance from ledger entries
      const result = await db
        .query()
        .from('ledger_entries as le')
        .join('ledger_accounts as la', 'le.ledger_account_id', 'la.id')
        .where('la.owner_id', wallet.id)
        .select(
          db.raw(
            "COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END), 0) as calculated"
          )
        )
        .first()

      const calculatedBalance = BigInt(result?.calculated || 0)

      if (calculatedBalance !== wallet.balanceCache) {
        const mismatch = {
          walletId: wallet.id,
          cachedBalance: wallet.balanceCache,
          calculatedBalance: calculatedBalance,
          difference: calculatedBalance - wallet.balanceCache,
        }

        mismatches.push(mismatch)

        // Log immediately — this is an emergency
        console.error(`[CRITICAL] Wallet balance mismatch detected:`, mismatch)
      }
    }

    return mismatches
  }

  /**
   * Check that all ledger transactions are balanced
   */
  static async checkTransactionBalance(): Promise<
    Array<{
      transactionId: number
      debits: bigint
      credits: bigint
      difference: bigint
    }>
  > {
    const imbalances: Array<{
      transactionId: number
      debits: bigint
      credits: bigint
      difference: bigint
    }> = []

    const result = await db
      .query()
      .from('ledger_entries')
      .select(
        'ledger_transaction_id',
        db.raw(`SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) as total_debits`),
        db.raw(`SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) as total_credits`)
      )
      .groupBy('ledger_transaction_id')

    for (const row of result) {
      const debits = BigInt(row.totalDebits || 0)
      const credits = BigInt(row.totalCredits || 0)

      if (debits !== credits) {
        imbalances.push({
          transactionId: row.ledgerTransactionId,
          debits,
          credits,
          difference: debits - credits,
        })

        console.error(`[CRITICAL] Transaction imbalance detected:`, {
          transactionId: row.ledgerTransactionId,
          debits: debits.toString(),
          credits: credits.toString(),
        })
      }
    }

    return imbalances
  }
}
