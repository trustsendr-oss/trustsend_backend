import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Long-lived sessions of the devices an account holder signed in on, unlocked with their PIN.
 *
 * Access tokens live one hour and /auth/refresh needs a still-valid one, so a phone left closed
 * longer was always sent back to email + password. A device session lets the app trade
 * "this device" + the PIN for a fresh access token instead. Only a SHA-256 of the device token
 * is stored: a database read alone cannot unlock anyone's account.
 */
export default class extends BaseSchema {
  protected tableName = 'device_sessions'

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
      table.string('token_hash', 64).notNullable().unique()
      table.string('platform', 16).nullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').notNullable()
      table.timestamps()

      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
