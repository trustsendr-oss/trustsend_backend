import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Vaults and Cash Transfer Circuit for IMF Branch Operations (Étape A).
 *
 * Implements the physical treasury hierarchy:
 *   [Main Vault / Coffre Central]
 *         │ ▲
 * (Dotation)│ │(Délestage / EOD Sweep)
 *         ▼ │
 *   [Teller Till / Tiroir Guichetier]
 *
 * Dual-control (4-eyes principle):
 * Every transfer between the central vault and a teller session requires approval
 * by a branch manager or designated vault custodian.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('business_vaults', (table) => {
      table.increments('id').notNullable()
      table
        .integer('business_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .onDelete('CASCADE')
      table.string('currency_code', 3).notNullable()
      table.string('name', 100).notNullable().defaultTo('Coffre Central')
      table.bigInteger('balance_cache').notNullable().defaultTo(0)
      table.bigInteger('max_capacity').nullable().comment('Plafond d assurance du coffre-fort')
      table.enum('status', ['active', 'locked', 'closed']).notNullable().defaultTo('active')
      table.timestamps()

      table.unique(['business_id', 'currency_code'])
    })

    this.schema.createTable('vault_transfers', (table) => {
      table.increments('id').notNullable()
      table
        .integer('vault_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('business_vaults')
        .onDelete('CASCADE')
      table
        .integer('teller_session_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('teller_sessions')
        .onDelete('CASCADE')
      table
        .enum('transfer_type', ['replenishment', 'sweep'])
        .notNullable()
        .comment('replenishment: Vault -> Till (dotation); sweep: Till -> Vault (délestage)')
      table.string('currency_code', 3).notNullable()
      table.bigInteger('amount').notNullable()
      table
        .integer('initiated_by_staff_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
      table
        .integer('approved_by_staff_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
      table
        .enum('status', ['requested', 'approved', 'rejected', 'completed'])
        .notNullable()
        .defaultTo('requested')
      table.text('notes').nullable()
      table.timestamp('decided_at').nullable()
      table.timestamps()

      table.index(['vault_id'])
      table.index(['teller_session_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable('vault_transfers')
    this.schema.dropTable('business_vaults')
  }
}
