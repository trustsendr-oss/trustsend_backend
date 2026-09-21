import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What a wallet is FOR, so an owner can hold more than one per currency.
 *
 * Savings placed with an IMF must leave the holder's spendable balance without leaving TumaPlus's
 * custody. The obvious home for that money — a `platform_internal` ledger account — is the wrong
 * one: LedgerService only row-locks accounts that back a wallet, and says so itself (see the
 * comment on its running-total branch: `SELECT ... FOR UPDATE` cannot lock a row that does not
 * exist yet, so those balances are explicitly best-effort). Customer money cannot sit on a
 * best-effort balance. An escrow wallet is therefore a real `wallets` row, owner_type stays
 * `user_wallet`, and it flows through LedgerService already locked and guarded against going
 * negative — no change to the posting engine at all.
 *
 * The unique constraints are what stood in the way: one wallet per (owner, currency) made a second
 * one impossible. They become partial, so the rule is now "one PRIMARY wallet per owner per
 * currency" and secondary wallets are distinguished by purpose. Applied to all three owner
 * dimensions rather than just users, so the rule does not depend on who owns the wallet.
 *
 * `wallets_agent_id_unique` is dropped outright: it capped an agent at a single wallet across all
 * currencies, making `wallets_agent_id_currency_code_unique` beside it unreachable. A counter in
 * the DRC handles USD and CDF at the same window, so it needs a float in each.
 */
export default class extends BaseSchema {
  protected tableName = 'wallets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('purpose')
        .notNullable()
        .defaultTo('primary')
        .comment('What this wallet is for; every pre-existing wallet is its owner’s primary')
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT wallets_purpose_check
      CHECK (purpose = ANY (ARRAY['primary', 'escrow', 'savings', 'collateral']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT wallets_agent_id_unique;
    `)

    for (const owner of ['user', 'agent', 'business']) {
      this.schema.raw(`
        ALTER TABLE ${this.tableName}
        DROP CONSTRAINT wallets_${owner}_id_currency_code_unique;
      `)
      this.schema.raw(`
        CREATE UNIQUE INDEX wallets_primary_per_${owner}
        ON ${this.tableName} (${owner}_id, currency_code) WHERE purpose = 'primary';
      `)
    }
  }

  async down() {
    for (const owner of ['user', 'agent', 'business']) {
      this.schema.raw(`DROP INDEX wallets_primary_per_${owner};`)
      this.schema.raw(`
        ALTER TABLE ${this.tableName}
        ADD CONSTRAINT wallets_${owner}_id_currency_code_unique UNIQUE (${owner}_id, currency_code);
      `)
    }

    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT wallets_agent_id_unique UNIQUE (agent_id);
    `)

    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT wallets_purpose_check;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('purpose')
    })
  }
}
