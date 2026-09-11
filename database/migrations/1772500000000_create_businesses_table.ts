import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('code', 50).notNullable().unique().comment('Unique business code')
      table.string('name').notNullable()
      table.string('email', 254).notNullable().unique()
      table.string('phone').notNullable()
      table
        .enum('status', ['pending_approval', 'active', 'suspended', 'terminated'])
        .notNullable()
        .defaultTo('pending_approval')
      table.integer('wallet_id').nullable().unsigned().comment('FK to wallets (primary business wallet)')
      table.string('webhook_url').nullable()
      table.timestamp('approved_at').nullable()
      table.integer('approved_by').nullable().unsigned().comment('FK to internal_users')
      table.timestamp('suspended_at').nullable()
      table.string('suspension_reason').nullable()
      table.timestamp('terminated_at').nullable()
      table.string('termination_reason').nullable()
      table.timestamps()

      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
