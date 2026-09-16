import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .enum('recipient_type', ['user', 'agent', 'business'])
        .notNullable()
        .comment('Who this notification is for')
      table.integer('recipient_id').notNullable()
      table.string('type').notNullable().comment('Event key, e.g. mobile_money_deposit.completed')
      table.string('title').notNullable()
      table.text('message').notNullable()
      table
        .jsonb('data')
        .nullable()
        .comment('Structured payload — related ids/amounts for the app to deep-link on')
      table.timestamp('read_at').nullable()
      table.timestamps()

      table.index(['recipient_type', 'recipient_id', 'read_at'])
      table.index(['recipient_type', 'recipient_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
