import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table
        .integer('user_id')
        .nullable()
        .unsigned()
        .unique()
        .comment('FK to users — the authenticated account this agent logs in as')
      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('user_id')
    })
  }
}
