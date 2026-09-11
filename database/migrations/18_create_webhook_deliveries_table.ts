import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_deliveries'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('subscription_id').unsigned().notNullable()
      table.string('event_type').notNullable()
      table.json('payload').notNullable()
      table.enum('status', ['pending', 'success', 'failed', 'retrying']).defaultTo('pending')
      table.integer('retry_count').defaultTo(0)
      table.timestamp('next_retry_at').nullable()
      table.text('last_error').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.foreign('subscription_id').references('webhook_subscriptions.id').onDelete('CASCADE')
      table.index(['subscription_id', 'status'])
      table.index(['next_retry_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
