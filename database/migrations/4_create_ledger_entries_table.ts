import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_entries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('ledger_transaction_id')
        .notNullable()
        .unsigned()
        .comment('FK to ledger_transactions (enveloper of this entry)')
      table
        .integer('ledger_account_id')
        .notNullable()
        .unsigned()
        .comment('FK to ledger_accounts (which account this entry affects)')
      table.enum('direction', ['debit', 'credit']).notNullable().comment('Debit or credit direction')
      table.bigInteger('amount').notNullable().comment('Amount (always positive, direction indicates +/−)')
      table.string('currency_code', 3).notNullable().defaultTo('XOF').comment('ISO 4217 currency code')
      table.bigInteger('balance_after').notNullable().comment('Wallet balance after this entry (snapshot)')

      table.timestamp('created_at').notNullable()

      // Constraints
      this.schema.raw(
        `ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0)`
      )

      // Indexes
      table.index(['ledger_transaction_id'])
      table.index(['ledger_account_id'])
      // Composite index for efficient balance queries
      table.index(['ledger_account_id', 'created_at'])
      // Index for partitioning by date (for future partitioning without schema change)
      table.index(['created_at'])
    })

    // Create trigger to prevent UPDATE/DELETE at application level too
    this.schema.raw(`
      CREATE OR REPLACE FUNCTION prevent_ledger_entries_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated or deleted';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER ledger_entries_immutable
      BEFORE UPDATE OR DELETE ON ${this.tableName}
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_entries_mutation();
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
