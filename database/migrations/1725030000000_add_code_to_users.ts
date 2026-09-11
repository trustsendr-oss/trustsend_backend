import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.string('code', 9).unique().nullable().comment('Unique user code - 9 digits (like phone number)')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('code')
    })
  }
}
