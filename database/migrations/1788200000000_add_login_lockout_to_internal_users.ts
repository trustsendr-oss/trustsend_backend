import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'internal_users'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.integer('login_attempts').defaultTo(0).comment('Failed login attempts')
      table.timestamp('login_locked_until').nullable().comment('Login locked after too many attempts')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('login_attempts')
      table.dropColumn('login_locked_until')
    })
  }
}
