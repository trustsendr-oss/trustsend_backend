import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ledger_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('code').notNullable().unique().comment('Account code, ex: PLATFORM.COMMISSION_REVENUE')
      table.string('name').notNullable().comment('Account display name')
      table
        .enum('account_type', ['asset', 'liability', 'equity', 'revenue', 'expense'])
        .notNullable()
        .comment('Accounting type per double-entry model')
      table
        .enum('owner_type', ['user_wallet', 'agent_wallet', 'platform_internal'])
        .notNullable()
        .comment('Owner of this account')
      table
        .integer('owner_id')
        .nullable()
        .comment('FK to wallets if owner_type = user_wallet or agent_wallet')
      table.string('currency_code', 3).notNullable().defaultTo('XOF').comment('ISO 4217 currency code')
      table.enum('status', ['active', 'closed']).notNullable().defaultTo('active')

      table.timestamps()

      // Indexes
      table.index(['owner_type', 'owner_id'])
      table.index(['account_type'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
