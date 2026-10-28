import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A likiliba message can answer another one of the same group, shown quoted above it. The link
 * survives the quoted message being deleted or hidden (the quote then says so); it is only
 * cleared if the row itself ever disappears.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('likiliba_messages', (table) => {
      table
        .integer('reply_to_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('likiliba_messages')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable('likiliba_messages', (table) => {
      table.dropColumn('reply_to_id')
    })
  }
}
