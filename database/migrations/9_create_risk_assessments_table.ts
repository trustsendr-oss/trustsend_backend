import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'risk_assessments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('ledger_transaction_id')
        .notNullable()
        .unsigned()
        .comment('FK to ledger_transactions (the transaction being assessed)')
      table.integer('score').notNullable().defaultTo(0).comment('Risk score (0-100)')
      table.enum('risk_level', ['low', 'medium', 'high', 'critical']).notNullable().defaultTo('low')
      table.jsonb('rules_triggered').nullable().comment('JSON array of rules that triggered')
      table
        .string('provider')
        .nullable()
        .comment('Fraud/risk provider name (if using external service)')
      table.string('provider_reference').nullable().comment('Reference from the provider')
      table
        .enum('decision', ['allow', 'review', 'block'])
        .notNullable()
        .defaultTo('allow')
        .comment('Decision: allow the transaction, flag for review, or block')

      table.timestamp('created_at').notNullable()

      // Indexes
      table.index(['ledger_transaction_id'])
      table.index(['risk_level'])
      table.index(['decision'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
