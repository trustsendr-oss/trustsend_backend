import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Expo push tokens of the devices an account holder is signed in on. One row per device: the
 * token is unique, so a phone handed to someone else moves to their account on next sign-in
 * instead of notifying both. Deleted on sign-out and when Expo reports the device unregistered.
 */
export default class extends BaseSchema {
  protected tableName = 'push_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('token', 255).notNullable().unique()
      table.string('platform', 16).notNullable()
      table.timestamps()

      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
