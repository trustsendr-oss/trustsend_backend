import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Safety net for missed crypto webhooks (see crypto_reconciliation_service.ts).
 *
 * `last_requested_at` dates the last time a deposit address was shown to its owner: deposits
 * follow within hours, so only recently shown addresses are re-scanned — the Transfers API is
 * billed per address, not per block. `crypto_reconciliation_cursors` remembers, per chain, the
 * block up to which those addresses were last scanned.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('crypto_deposit_addresses', (table) => {
      table.timestamp('last_requested_at').nullable()
      table.index(['status', 'last_requested_at'])
    })
    this.defer(async (db) => {
      await db.rawQuery(
        'UPDATE crypto_deposit_addresses SET last_requested_at = created_at WHERE last_requested_at IS NULL'
      )
    })

    this.schema.createTable('crypto_reconciliation_cursors', (table) => {
      table.increments('id').notNullable()
      // `bsc:mainnet`, `bsc:testnet`: a database switched between modes never mixes block heights.
      table.string('chain', 40).notNullable().unique()
      table.bigInteger('last_block').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable('crypto_reconciliation_cursors')
    this.schema.alterTable('crypto_deposit_addresses', (table) => {
      table.dropIndex(['status', 'last_requested_at'])
      table.dropColumn('last_requested_at')
    })
  }
}
