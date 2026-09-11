import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Change ledger_transactions id to VARCHAR
    this.schema.raw(`
      ALTER TABLE ledger_transactions
      DROP CONSTRAINT ledger_transactions_pkey CASCADE;

      ALTER TABLE ledger_transactions
      ALTER COLUMN id TYPE VARCHAR(12);

      ALTER TABLE ledger_transactions
      ADD PRIMARY KEY (id);
    `)

    // Change disputes id to VARCHAR
    this.schema.raw(`
      ALTER TABLE disputes
      DROP CONSTRAINT disputes_pkey CASCADE;

      ALTER TABLE disputes
      ALTER COLUMN id TYPE VARCHAR(12);

      ALTER TABLE disputes
      ADD PRIMARY KEY (id);
    `)

    // Change kyc_verifications id to VARCHAR
    this.schema.raw(`
      ALTER TABLE kyc_verifications
      DROP CONSTRAINT kyc_verifications_pkey CASCADE;

      ALTER TABLE kyc_verifications
      ALTER COLUMN id TYPE VARCHAR(12);

      ALTER TABLE kyc_verifications
      ADD PRIMARY KEY (id);
    `)

    // Note: wallets.id remains INT for now - only transaction-related IDs are alphanumeric

    // Change ledger_entries id to VARCHAR
    this.schema.raw(`
      ALTER TABLE ledger_entries
      DROP CONSTRAINT ledger_entries_pkey CASCADE;

      ALTER TABLE ledger_entries
      ALTER COLUMN id TYPE VARCHAR(12);

      ALTER TABLE ledger_entries
      ADD PRIMARY KEY (id);
    `)
  }

  async down() {
    // Rollback: change back to INT
    this.schema.raw(`
      ALTER TABLE ledger_transactions
      DROP CONSTRAINT ledger_transactions_pkey CASCADE;

      ALTER TABLE ledger_transactions
      ALTER COLUMN id TYPE INTEGER;

      ALTER TABLE ledger_transactions
      ADD PRIMARY KEY (id);
    `)

    this.schema.raw(`
      ALTER TABLE disputes
      DROP CONSTRAINT disputes_pkey CASCADE;

      ALTER TABLE disputes
      ALTER COLUMN id TYPE INTEGER;

      ALTER TABLE disputes
      ADD PRIMARY KEY (id);
    `)

    this.schema.raw(`
      ALTER TABLE kyc_verifications
      DROP CONSTRAINT kyc_verifications_pkey CASCADE;

      ALTER TABLE kyc_verifications
      ALTER COLUMN id TYPE INTEGER;

      ALTER TABLE kyc_verifications
      ADD PRIMARY KEY (id);
    `)

    // Note: wallets.id remains INT - no rollback needed

    this.schema.raw(`
      ALTER TABLE ledger_entries
      DROP CONSTRAINT ledger_entries_pkey CASCADE;

      ALTER TABLE ledger_entries
      ALTER COLUMN id TYPE INTEGER;

      ALTER TABLE ledger_entries
      ADD PRIMARY KEY (id);
    `)
  }
}
