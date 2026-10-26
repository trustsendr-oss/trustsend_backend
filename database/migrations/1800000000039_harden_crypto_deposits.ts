import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Real crypto deposits.
 *
 * Until now a deposit address was a random hash shaped like an EVM address: no key existed for
 * it, so anything sent there was lost for good. Addresses are now derived from the treasury's
 * extended public key (see deposit_address_deriver.ts); `derivation_index` records which child
 * each one is, and the sequence hands out a fresh index per owner without races. The legacy rows
 * are revoked: nobody can spend from them, so they must never be shown again.
 *
 * `crypto_deposits` holds every on-chain transfer reported to a deposit address, from the moment
 * the webhook announces it until the chain has confirmed it enough to credit — or proved it
 * wrong. The webhook only records; crediting is the confirmation job's decision.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      'CREATE SEQUENCE IF NOT EXISTS crypto_deposit_derivation_seq START WITH 0 MINVALUE 0'
    )

    this.schema.alterTable('crypto_deposit_addresses', (table) => {
      table.integer('derivation_index').nullable()
      table.unique(['derivation_index', 'network', 'token_symbol'])
    })

    this.defer(async (db) => {
      await db.from('crypto_deposit_addresses').whereNull('derivation_index').update({
        status: 'revoked',
        updated_at: new Date(),
      })
    })

    this.schema.createTable('crypto_deposits', (table) => {
      table.increments('id').notNullable()
      table.string('network', 30).notNullable()
      table.string('tx_hash', 80).notNullable()
      table.integer('log_index').notNullable()
      table.string('token_symbol', 10).notNullable()
      table.string('contract_address', 64).notNullable()
      table.string('to_address', 64).notNullable()
      table.string('from_address', 64).nullable()
      table.decimal('raw_amount', 78, 0).notNullable().comment('Token base units, as reported')
      table.bigInteger('block_number').nullable()
      table.integer('confirmations').notNullable().defaultTo(0)
      table
        .integer('deposit_address_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('crypto_deposit_addresses')
      table.enum('status', ['pending', 'credited', 'rejected']).notNullable().defaultTo('pending')
      table.string('reject_reason', 60).nullable()
      table.string('ledger_transaction_id').nullable()
      table.timestamp('credited_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      // One row per on-chain transfer: a webhook replayed by Alchemy changes nothing.
      table.unique(['network', 'tx_hash', 'log_index'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable('crypto_deposits')
    this.schema.alterTable('crypto_deposit_addresses', (table) => {
      table.dropUnique(['derivation_index', 'network', 'token_symbol'])
      table.dropColumn('derivation_index')
    })
    this.schema.raw('DROP SEQUENCE IF EXISTS crypto_deposit_derivation_seq')
  }
}
