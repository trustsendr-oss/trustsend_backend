import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.string('pin_hash', 255).nullable().comment('Hashed PIN (4-6 digits)')
      table.integer('pin_attempts').defaultTo(0).comment('Failed PIN attempts')
      table.timestamp('pin_locked_until').nullable().comment('PIN locked after too many attempts')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('pin_hash')
      table.dropColumn('pin_attempts')
      table.dropColumn('pin_locked_until')
    })
  }
}
