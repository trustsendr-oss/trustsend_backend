import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Reactions to a likiliba message: one emoji per member and message, replaced when the member
 * picks another and removed when they pick the same one again.
 */
export default class extends BaseSchema {
  protected tableName = 'likiliba_message_reactions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('message_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_messages')
        .onDelete('CASCADE')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.string('emoji', 16).notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['message_id', 'member_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
