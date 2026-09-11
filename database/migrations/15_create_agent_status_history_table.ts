import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agent_status_history'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('agent_id').notNullable().unsigned().comment('FK to agents')
      table
        .enum('previous_status', ['pending_approval', 'active', 'suspended', 'terminated'])
        .notNullable()
      table
        .enum('new_status', ['pending_approval', 'active', 'suspended', 'terminated'])
        .notNullable()
      table
        .enum('changed_by', ['system', 'internal_user'])
        .notNullable()
        .comment('Who triggered the change')
      table
        .integer('changed_by_id')
        .nullable()
        .unsigned()
        .comment('FK to internal_users if changed_by=internal_user')
      table.string('reason').nullable().comment('Reason for status change')
      table.timestamp('created_at').notNullable()

      // Immutability: append-only
      this.schema.raw(`
        CREATE TRIGGER agent_status_history_immutable
        BEFORE UPDATE OR DELETE ON ${this.tableName}
        FOR EACH ROW
        EXECUTE FUNCTION prevent_ledger_entries_mutation();
      `)

      // Indexes
      table.index(['agent_id'])
      table.index(['new_status'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
