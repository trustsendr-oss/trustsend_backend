import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * audit_logs.resource_id is a polymorphic reference (paired with resource_type) — it must hold
 * both plain integer ids (agent, wallet, user, ...) and the alphanumeric ids used by resources
 * migrated to string primary keys (ledger_transaction "TXN-...", dispute "DSP-...",
 * kyc_verification "KYC-..."). It was left as INTEGER when those resources were migrated,
 * silently breaking audit logging for any of them.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE audit_logs
      ALTER COLUMN resource_id TYPE VARCHAR(20);
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE audit_logs
      ALTER COLUMN resource_id TYPE INTEGER USING NULL;
    `)
  }
}
