import { BaseCommand, flags } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import LedgerEntry from '#models/ledger_entry'

const PAYMENT_METHOD_BY_TYPE: Record<string, string> = {
  mobile_money_deposit: 'mobile_money',
  mobile_money_payout: 'mobile_money',
  cash_in: 'cash_agent',
  cash_out: 'cash_agent',
  p2p_transfer: 'wallet',
  agent_float_transfer: 'float_transfer',
  card_issuance: 'card',
  card_topup: 'card',
  card_withdrawal: 'card',
  business_plan_subscription: 'wallet',
  business_plan_maintenance_fee: 'wallet',
}

/**
 * One-off, idempotent backfill for the columns added by migration
 * 1793400000000_add_payment_detail_columns_to_ledger_transactions.ts — only touches rows where
 * `amount` is still NULL, so it's safe to re-run without re-processing rows already backfilled
 * or created after this migration (the updated services now populate these directly).
 *
 * Run with `node ace backfill:transaction-columns` (add `--dry-run` to only report counts).
 */
export default class BackfillTransactionColumns extends BaseCommand {
  static commandName = 'backfill:transaction-columns'
  static options = { startApp: true }

  @flags.boolean({ description: 'Report counts without writing any changes' })
  declare dryRun: boolean

  async run() {
    const dryRun = this.dryRun === true

    const rows = await LedgerTransaction.query().whereNull('amount').orderBy('id', 'asc')

    let updated = 0
    let skipped = 0

    for (const txn of rows) {
      const metadata = (txn.metadata as Record<string, any>) || {}

      let amount: bigint | null = null
      let currencyCode: string | null = null
      if (metadata.amount) {
        try {
          amount = BigInt(metadata.amount)
          currencyCode = metadata.currency_code || null
        } catch {
          amount = null
        }
      }

      if (amount === null) {
        // Fall back to the transaction's own ledger_entries — use the first debit leg as the
        // principal amount (matches how every service defines "the" amount: the side that's
        // debited in full before any fee split).
        const entry = await LedgerEntry.query()
          .where('ledger_transaction_id', txn.id)
          .where('direction', 'debit')
          .orderBy('created_at', 'asc')
          .first()
        if (entry) {
          amount = entry.amount
          currencyCode = entry.currencyCode
        }
      }

      const paymentMethod = PAYMENT_METHOD_BY_TYPE[txn.type] || null
      const paymentChannel = metadata.provider_code || txn.provider || null
      const counterpartyPhone = metadata.phone_number || null
      const fee = metadata.fee ?? metadata.commission
      const feeAmount = fee !== undefined && fee !== null ? BigInt(fee) : null
      const failureReasonRaw = metadata.failure_reason
      const failureReason =
        failureReasonRaw && typeof failureReasonRaw === 'object'
          ? `${failureReasonRaw.code}: ${failureReasonRaw.message}`
          : failureReasonRaw || null
      const relatedTransactionId = metadata.posted_transaction_id || null

      if (amount === null && !paymentMethod && !failureReason && !relatedTransactionId) {
        // Nothing recoverable for this row (e.g. a stray reversal/adjustment with no metadata
        // and no entries) — leave the columns NULL rather than write meaningless zeros.
        skipped++
        continue
      }

      if (dryRun) {
        updated++
        continue
      }

      txn.amount = amount
      txn.currencyCode = currencyCode
      txn.paymentMethod = paymentMethod
      txn.paymentChannel = paymentChannel
      txn.counterpartyPhone = counterpartyPhone
      txn.fee = feeAmount
      txn.failureReason = failureReason
      txn.relatedTransactionId = relatedTransactionId
      await txn.save()
      updated++

      // Reciprocal link: if this tracking row points at a posted row, make the posted row point
      // back too (only if it doesn't already have one, so a manual correction is never clobbered).
      if (relatedTransactionId) {
        await db
          .from('ledger_transactions')
          .where('id', relatedTransactionId)
          .whereNull('related_transaction_id')
          .update({ related_transaction_id: txn.id })
      }
    }

    this.logger.info(
      `${rows.length} row(s) with amount IS NULL found — ${updated} ${dryRun ? 'would be updated' : 'updated'}, ${skipped} left unrecoverable (no metadata/entries to backfill from).`
    )
  }
}
