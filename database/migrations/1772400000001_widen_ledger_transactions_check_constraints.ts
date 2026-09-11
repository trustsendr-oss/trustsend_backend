import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * ledger_transactions.status/type/initiated_by_type are TEXT columns backed by CHECK
 * constraints (knex's non-native `.enum()`), not real Postgres enums. The original
 * constraints only covered the transaction types envisioned when the table was created —
 * they never accounted for statuses actually used by cash-in/cash-out (reserved, settled,
 * cancelled, rejected), for `internal_user`-initiated reversals (disputes), or for the
 * dynamically-built `${type}_reversal` type LedgerService.reverseTransaction generates for
 * ANY transaction type. All of those inserts fail today with a CHECK violation.
 */
export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  async up() {
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT ledger_transactions_status_check;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_transactions_status_check
      CHECK (status = ANY (ARRAY[
        'initiated', 'pending', 'processing', 'completed', 'failed', 'reversed',
        'reserved', 'settled', 'cancelled', 'rejected'
      ]::text[]));
    `)

    // `type` is combined freely with '_reversal' for any existing type at runtime — a fixed
    // allow-list can never cover that. The column stays NOT NULL; only the enumeration is
    // dropped in favour of application-level validation at the call sites (vine validators,
    // service-level literals — never raw user input).
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT ledger_transactions_type_check;
    `)

    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT ledger_transactions_initiated_by_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_transactions_initiated_by_type_check
      CHECK (initiated_by_type = ANY (ARRAY['user', 'agent', 'system', 'internal_user']::text[]));
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT ledger_transactions_status_check;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_transactions_status_check
      CHECK (status = ANY (ARRAY['pending', 'processing', 'completed', 'failed', 'reversed']::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_transactions_type_check
      CHECK (type = ANY (ARRAY[
        'p2p_transfer', 'cash_in', 'cash_out', 'agent_float_transfer',
        'commission_settlement', 'reversal', 'adjustment'
      ]::text[]));
    `)

    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT ledger_transactions_initiated_by_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT ledger_transactions_initiated_by_type_check
      CHECK (initiated_by_type = ANY (ARRAY['user', 'agent', 'system']::text[]));
    `)
  }
}
