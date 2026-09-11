import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_subscriptions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable()
      table.string('url').notNullable()
      table.json('events').notNullable() // Array of event types
      table.string('secret', 64).notNullable()
      table.boolean('active').defaultTo(true)
      table.timestamp('created_at')
      table.timestamp('updated_at')

      table.foreign('user_id').references('users.id').onDelete('CASCADE')
      table.index(['user_id'])
      table.unique(['user_id', 'url'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
