import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.uuid('uuid').notNullable().unique().comment('Public reference for the transaction')
      table
        .enum('type', [
          'p2p_transfer',
          'cash_in',
          'cash_out',
          'agent_float_transfer',
          'commission_settlement',
          'reversal',
          'adjustment',
        ])
        .notNullable()
        .comment('Transaction type')
      table
        .enum('status', ['pending', 'processing', 'completed', 'failed', 'reversed'])
        .notNullable()
        .defaultTo('pending')
        .comment('Current status in the transaction lifecycle')
      table.string('idempotency_key').nullable().unique().comment('Client-provided idempotency key')
      table.string('correlation_id').notNullable().comment('Request correlation ID for tracing')
      table
        .enum('initiated_by_type', ['user', 'agent', 'system'])
        .notNullable()
        .comment('Who initiated this transaction')
      table
        .integer('initiated_by_id')
        .notNullable()
        .comment('ID of the user/agent/system that initiated this')
      table
        .integer('reversal_of_transaction_id')
        .nullable()
        .unsigned()
        .comment('FK to original transaction if this is a reversal')
      table.text('description').nullable().comment('Human-readable description')
      table.jsonb('metadata').nullable().comment('Additional metadata (JSON)')

      table.timestamp('created_at').notNullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('reversed_at').nullable()

      // Indexes
      table.index(['uuid'])
      table.index(['type'])
      table.index(['status'])
      table.index(['initiated_by_type', 'initiated_by_id'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
