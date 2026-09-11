import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'outbox_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .string('aggregate_type', 100)
        .notNullable()
        .comment('Entity type that generated the event')
      table.integer('aggregate_id').notNullable().comment('ID of the entity')
      table.string('event_type', 100).notNullable().comment('Type of event (e.g., transfer_settled)')
      table.jsonb('payload').notNullable().comment('Event payload (JSON)')
      table
        .enum('status', ['pending', 'processing', 'published', 'failed'])
        .notNullable()
        .defaultTo('pending')
      table.integer('attempts').notNullable().defaultTo(0).comment('Number of delivery attempts')

      table.timestamp('created_at').notNullable()
      table.timestamp('published_at').nullable()

      // Indexes
      table.index(['status'])
      table.index(['created_at'])
      table.index(['aggregate_type', 'aggregate_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
