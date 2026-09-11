import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'wallets'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').nullable().unsigned().comment('FK to users if owner is a user')
      table.integer('agent_id').nullable().unsigned().comment('FK to agents if owner is an agent')
      table
        .integer('ledger_account_id')
        .notNullable()
        .unsigned()
        .comment('FK to ledger_accounts (the accounting entry for this wallet)')
      table.string('currency_code', 3).notNullable().defaultTo('USD').comment('ISO 4217 code')
      table.bigInteger('balance_cache').notNullable().defaultTo(0).comment('Dénormalized balance (cache)')
      table
        .bigInteger('per_transaction_limit')
        .nullable()
        .comment('Maximum per single transaction (optional override)')
      table
        .bigInteger('daily_limit')
        .nullable()
        .comment('Maximum per day (optional override)')
      table
        .bigInteger('monthly_limit')
        .nullable()
        .comment('Maximum per month (optional override)')
      table.enum('status', ['active', 'frozen', 'closed']).notNullable().defaultTo('active')
      table.integer('lock_version').notNullable().defaultTo(0).comment('Optimistic lock version')

      table.timestamps()

      // Constraints
      this.schema.raw(
        `ALTER TABLE ${this.tableName} ADD CONSTRAINT wallets_single_owner
       CHECK ((user_id IS NOT NULL)::int + (agent_id IS NOT NULL)::int = 1)`
      )

      // Indexes
      table.index(['user_id'])
      table.unique(['agent_id'])
      table.index(['status'])
      table.index(['currency_code'])
      // Allow multiple wallets per user (one per currency)
      table.unique(['user_id', 'currency_code'])
      table.unique(['agent_id', 'currency_code'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
