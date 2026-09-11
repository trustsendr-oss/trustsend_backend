import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Widens the CHECK constraints that need to accept a `business` actor/owner, now that
 * businesses can initiate mobile money transactions and hold wallets directly.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE ledger_accounts DROP CONSTRAINT ledger_accounts_owner_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_owner_type_check
      CHECK (owner_type = ANY (ARRAY['user_wallet', 'agent_wallet', 'business_wallet', 'platform_internal']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_initiated_by_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_initiated_by_type_check
      CHECK (initiated_by_type = ANY (ARRAY['user', 'agent', 'system', 'internal_user', 'business']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_actor_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_actor_type_check
      CHECK (actor_type = ANY (ARRAY['user', 'agent', 'business']::text[]));
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE ledger_accounts DROP CONSTRAINT ledger_accounts_owner_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_owner_type_check
      CHECK (owner_type = ANY (ARRAY['user_wallet', 'agent_wallet', 'platform_internal']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_initiated_by_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_initiated_by_type_check
      CHECK (initiated_by_type = ANY (ARRAY['user', 'agent', 'system', 'internal_user']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_actor_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_actor_type_check
      CHECK (actor_type = ANY (ARRAY['user', 'agent']::text[]));
    `)
  }
}
