import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Debt restructurings for microfinance loans (P3).
 *
 * Tracks every time a loan contract is renegotiated: tenor extension, interest rate revision,
 * grace period, or recapitalisation of overdue interest/penalties.
 * Regulators (BCC, BCEAO, COBAC) require restructured loans to be flagged and reported separately
 * from ordinary performing loans.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('loans', (table) => {
      table.boolean('is_restructured').notNullable().defaultTo(false)
      table.timestamp('restructured_at').nullable()
      table.integer('restructure_count').notNullable().defaultTo(0)
      table.timestamp('defaulted_at').nullable()
      table.text('default_reason').nullable()
    })

    this.schema.createTable('loan_restructurings', (table) => {
      table.increments('id').notNullable()
      table
        .integer('loan_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('loans')
        .onDelete('CASCADE')
      table
        .integer('decided_by_staff_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
        .comment('The officer or committee member who authorized the restructuring')

      // Previous state
      table.bigInteger('previous_principal_outstanding').notNullable()
      table.bigInteger('previous_interest_outstanding').notNullable()
      table.integer('previous_term_months').notNullable()
      table.integer('previous_interest_rate_bps').notNullable()

      // New terms
      table.bigInteger('new_principal_outstanding').notNullable()
      table.integer('new_term_months').notNullable()
      table.integer('new_interest_rate_bps').notNullable()
      table.integer('grace_period_months').notNullable().defaultTo(0)

      table.text('reason').notNullable().comment('Motif de rééchelonnement (justification réglementaire)')
      table.timestamp('restructured_at').notNullable()
      table.timestamps()

      table.index(['loan_id'])
      table.index(['restructured_at'])
    })
  }

  async down() {
    this.schema.dropTable('loan_restructurings')
    this.schema.alterTable('loans', (table) => {
      table.dropColumn('is_restructured')
      table.dropColumn('restructured_at')
      table.dropColumn('restructure_count')
      table.dropColumn('defaulted_at')
      table.dropColumn('default_reason')
    })
  }
}
