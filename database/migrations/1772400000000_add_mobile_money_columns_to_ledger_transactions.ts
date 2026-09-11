import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('provider', 30).nullable().comment('mobile money provider, e.g. pawapay')
      table
        .string('provider_reference_id', 36)
        .nullable()
        .comment('depositId/payoutId sent to the provider')
      table.unique(['provider', 'provider_reference_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['provider', 'provider_reference_id'])
      table.dropColumn('provider')
      table.dropColumn('provider_reference_id')
    })
  }
}
