import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kyc_verifications'

  async up() {
    this.schema.table(this.tableName, (table) => {
      table.integer('reviewed_by').nullable().comment('ID of internal user who reviewed')
    })
  }

  async down() {
    this.schema.table(this.tableName, (table) => {
      table.dropColumn('reviewed_by')
    })
  }
}
