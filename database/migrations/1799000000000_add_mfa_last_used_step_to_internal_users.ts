import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'internal_users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('mfa_last_used_step')
        .nullable()
        .comment('Last accepted TOTP time step, to reject a replayed code')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('mfa_last_used_step')
    })
  }
}
