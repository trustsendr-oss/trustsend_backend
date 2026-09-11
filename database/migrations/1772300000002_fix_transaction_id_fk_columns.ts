import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `ledger_transactions.id` (and `disputes.id`) were converted to VARCHAR(12) by
 * 1725050000000_change_ids_to_varchar, but the columns that reference them by value were left
 * as INTEGER — silently broken (any real "TXN-XXXXXXXX" / "DSP-XXXXXXXX" value fails to insert).
 * This affects the dispute-filing flow (disputes.ledger_transaction_id) and the not-yet-used
 * reversal columns (ledger_transactions.reversal_of_transaction_id, disputes.resolution_transaction_id).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE ledger_transactions
      ALTER COLUMN reversal_of_transaction_id TYPE VARCHAR(12);
    `)

    this.schema.raw(`
      ALTER TABLE disputes
      ALTER COLUMN ledger_transaction_id TYPE VARCHAR(12);
    `)

    this.schema.raw(`
      ALTER TABLE disputes
      ALTER COLUMN resolution_transaction_id TYPE VARCHAR(12);
    `)

    this.schema.raw(`
      ALTER TABLE ledger_entries
      ALTER COLUMN ledger_transaction_id TYPE VARCHAR(12);
    `)

    this.schema.raw(`
      ALTER TABLE outbox_events
      ALTER COLUMN aggregate_id TYPE VARCHAR(12);
    `)

    this.schema.raw(`
      ALTER TABLE risk_assessments
      ALTER COLUMN ledger_transaction_id TYPE VARCHAR(12);
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE ledger_transactions
      ALTER COLUMN reversal_of_transaction_id TYPE INTEGER USING NULL;
    `)

    this.schema.raw(`
      ALTER TABLE disputes
      ALTER COLUMN ledger_transaction_id TYPE INTEGER USING NULL;
    `)

    this.schema.raw(`
      ALTER TABLE disputes
      ALTER COLUMN resolution_transaction_id TYPE INTEGER USING NULL;
    `)

    this.schema.raw(`
      ALTER TABLE ledger_entries
      ALTER COLUMN ledger_transaction_id TYPE INTEGER USING NULL;
    `)

    this.schema.raw(`
      ALTER TABLE outbox_events
      ALTER COLUMN aggregate_id TYPE INTEGER USING NULL;
    `)

    this.schema.raw(`
      ALTER TABLE risk_assessments
      ALTER COLUMN ledger_transaction_id TYPE INTEGER USING NULL;
    `)
  }
}
