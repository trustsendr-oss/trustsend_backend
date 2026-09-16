import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  /**
   * Purely additive, display/query-convenience columns — see admin/transactions_controller.ts
   * for why they exist (the transaction itself carried no amount, no normalized payment method,
   * and no visible link between a mobile money "tracking" row and the double-entry "posted" row
   * it's paired with, all of which used to live only inside the untyped `metadata` jsonb, under
   * inconsistent keys per transaction type).
   *
   * `amount`/`currency_code` are a denormalized convenience for display and filtering ONLY — the
   * source of truth for any balance or accounting calculation remains `ledger_entries` via
   * LedgerService. Never derive a balance from these two columns.
   */
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('amount')
        .nullable()
        .comment(
          'Display/filter convenience only — never a source of truth for balances, see ledger_entries'
        )
      table.string('currency_code', 3).nullable()
      table
        .string('payment_method', 30)
        .nullable()
        .comment('Normalized channel category, e.g. mobile_money, card, cash_agent, wallet')
      table
        .string('payment_channel', 50)
        .nullable()
        .comment(
          'Specific provider/operator within payment_method, e.g. MTN_MOMO_ZMB, pawapay, card brand'
        )
      table
        .string('counterparty_phone', 20)
        .nullable()
        .comment('Mobile money MSISDN, when applicable')
      table.bigInteger('fee').nullable().comment('Unified fee/commission, smallest currency unit')
      table.text('failure_reason').nullable()
      table
        .string('related_transaction_id', 12)
        .nullable()
        .references('id')
        .inTable('ledger_transactions')
        .comment('Links a mobile money tracking row to its posted double-entry row, and vice versa')

      table.index(['payment_method'])
      table.index(['related_transaction_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('amount')
      table.dropColumn('currency_code')
      table.dropColumn('payment_method')
      table.dropColumn('payment_channel')
      table.dropColumn('counterparty_phone')
      table.dropColumn('fee')
      table.dropColumn('failure_reason')
      table.dropColumn('related_transaction_id')
    })
  }
}
