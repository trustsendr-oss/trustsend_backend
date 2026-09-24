import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('savings_accounts', (table) => {
      table.bigInteger('locked_collateral_amount').notNullable().defaultTo(0).comment('Amount pledged/locked as collateral for loans')
    })

    this.schema.alterTable('users', (table) => {
      table.integer('assigned_loan_officer_id').unsigned().nullable().references('id').inTable('business_staff').onDelete('SET NULL')
    })

    this.schema.alterTable('loans', (table) => {
      table.bigInteger('mandatory_savings_locked').notNullable().defaultTo(0).comment('Compulsory cash collateral held for this loan')
      table.integer('collateral_savings_account_id').unsigned().nullable().references('id').inTable('savings_accounts').onDelete('SET NULL')
      table.enum('collateral_status', ['none', 'locked', 'released', 'seized']).notNullable().defaultTo('none')
      table.string('stage', 30).notNullable().defaultTo('requested').comment('Workflow stage: requested, under_review, committee_approved, rejected, disbursed, closed')
      table.integer('assigned_loan_officer_id').unsigned().nullable().references('id').inTable('business_staff').onDelete('SET NULL')
      table.timestamp('committee_decision_at').nullable()
      table.text('committee_notes').nullable()
      table.bigInteger('approved_principal').nullable()
    })
  }

  async down() {
    this.schema.alterTable('loans', (table) => {
      table.dropColumn('mandatory_savings_locked')
      table.dropColumn('collateral_savings_account_id')
      table.dropColumn('collateral_status')
      table.dropColumn('stage')
      table.dropColumn('assigned_loan_officer_id')
      table.dropColumn('committee_decision_at')
      table.dropColumn('committee_notes')
      table.dropColumn('approved_principal')
    })

    this.schema.alterTable('users', (table) => {
      table.dropColumn('assigned_loan_officer_id')
    })

    this.schema.alterTable('savings_accounts', (table) => {
      table.dropColumn('locked_collateral_amount')
    })
  }
}
