import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('password').nullable().comment('Hashed dashboard login password')
      table.integer('login_attempts').defaultTo(0).comment('Failed login attempts')
      table.timestamp('login_locked_until').nullable().comment('Login locked after too many attempts')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('password')
      table.dropColumn('login_attempts')
      table.dropColumn('login_locked_until')
    })
  }
}
