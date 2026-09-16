import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('pin_hash', 255)
        .nullable()
        .comment(
          'Hashed PIN (4 digits) — required only for dashboard-session financial operations, never for API key calls'
        )
      table.integer('pin_attempts').defaultTo(0).comment('Failed PIN attempts')
      table.timestamp('pin_locked_until').nullable().comment('PIN locked after too many attempts')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('pin_hash')
      table.dropColumn('pin_attempts')
      table.dropColumn('pin_locked_until')
    })
  }
}
