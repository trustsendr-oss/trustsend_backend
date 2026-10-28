import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * audit_logs.resource_id was sized for `TXN-XXXXXXXX`-style ids (see 1772300000003). Card
 * top-up sessions are UUIDs (36 chars) and GoFreshPay transaction ids look like
 * `FP-20260930-101530-a1b2c3d4-CD`: both overflowed it. Widening a VARCHAR is a catalog-only
 * change in Postgres — no rewrite, no lock beyond the instant of the ALTER.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE audit_logs ALTER COLUMN resource_id TYPE VARCHAR(64)')
  }

  async down() {
    // Fails, on purpose, if a longer id has been written since: truncating audit ids would make
    // them point at nothing.
    this.schema.raw('ALTER TABLE audit_logs ALTER COLUMN resource_id TYPE VARCHAR(20)')
  }
}
