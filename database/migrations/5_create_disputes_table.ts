import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'disputes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('ledger_transaction_id')
        .notNullable()
        .unsigned()
        .comment('FK to ledger_transactions (the transaction being disputed)')
      table
        .enum('raised_by_type', ['user', 'agent', 'internal_user'])
        .notNullable()
        .comment('Who opened this dispute')
      table.integer('raised_by_id').notNullable().comment('ID of the person who opened it')
      table.text('reason').notNullable().comment('Reason for the dispute')
      table
        .enum('status', ['opened', 'investigating', 'approved', 'rejected', 'resolved'])
        .notNullable()
        .defaultTo('opened')
      table
        .integer('assigned_to')
        .nullable()
        .unsigned()
        .comment('FK to internal_users (who is investigating)')
      table
        .integer('resolution_transaction_id')
        .nullable()
        .unsigned()
        .comment('FK to ledger_transactions (the reversal transaction if approved)')
      table.text('resolution_notes').nullable().comment('Notes on how this was resolved')

      table.timestamp('opened_at').notNullable()
      table.timestamp('resolved_at').nullable()
      table.timestamps()

      // Indexes
      table.index(['ledger_transaction_id'])
      table.index(['status'])
      table.index(['assigned_to'])
      table.index(['opened_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
