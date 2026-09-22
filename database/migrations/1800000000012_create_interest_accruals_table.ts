import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per savings account per period, recording that its interest has been paid.
 *
 * The table exists for its unique index and almost nothing else. Accrual runs unattended on every
 * account in the system, and the failure that matters is not getting a figure slightly wrong — it
 * is a retry, a duplicated cron, or an operator re-running last night's job paying everyone twice.
 * Making the period the key turns that from a disaster into a no-op: the second run inserts
 * nothing and posts nothing.
 *
 * `period_key` is the calendar period the interest is FOR ("2026-09"), never the moment the job
 * happened to run. A job run late, or run twice, still settles the same period once.
 *
 * `balance_used` is kept because a saver asking "why did I get this much?" deserves an answer
 * years later, when the balance it was computed from is long gone.
 */
export default class extends BaseSchema {
  protected tableName = 'interest_accruals'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('savings_account_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('savings_accounts')
        .onDelete('CASCADE')
      table
        .string('period_key', 7)
        .notNullable()
        .comment('The period the interest is for, e.g. "2026-09" — not when the job ran')
      table
        .bigInteger('balance_used')
        .notNullable()
        .comment('The balance the figure was computed from, so it can be explained later')
      table.integer('rate_bps').notNullable().comment('The rate on the account, not on the product')
      table.bigInteger('amount').notNullable()
      table
        .string('ledger_transaction_id')
        .nullable()
        .comment('Null when the computed interest rounded to zero and nothing was posted')
      table.timestamp('accrued_at').notNullable()
      table.timestamps()

      // The whole point of the table.
      table.unique(['savings_account_id', 'period_key'])
      table.index(['period_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
