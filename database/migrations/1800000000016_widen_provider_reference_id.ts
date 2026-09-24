import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('provider_reference_id', 120).nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('provider_reference_id', 36).nullable().alter()
    })
  }
}
