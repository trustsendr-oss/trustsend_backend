import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'idempotency_keys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('key').notNullable().comment('Idempotency key from client')
      table.enum('actor_type', ['user', 'agent']).notNullable().comment('Who issued this request')
      table.integer('actor_id').notNullable().comment('ID of the actor')
      table.string('endpoint', 500).notNullable().comment('Endpoint that handled the request')
      table.string('request_hash').notNullable().comment('SHA256 hash of request body')
      table
        .enum('status', ['in_progress', 'completed', 'failed'])
        .notNullable()
        .defaultTo('in_progress')
      table.integer('response_status').nullable().comment('HTTP status of the response')
      table.jsonb('response_body').nullable().comment('Response body snapshot')

      table.timestamp('created_at').notNullable()
      table
        .timestamp('expires_at')
        .notNullable()
        .comment('When this idempotency key expires (typically 24h)')

      // Constraints and Indexes
      table.unique(['actor_type', 'actor_id', 'key', 'endpoint'])
      table.index(['created_at'])
      table.index(['expires_at'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
