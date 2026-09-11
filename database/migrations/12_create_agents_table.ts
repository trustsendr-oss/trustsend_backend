import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('code', 50).notNullable().unique().comment('Unique agent code')
      table.string('full_name').notNullable().comment('Agent legal/business name')
      table.string('email', 254).notNullable().comment('Agent contact email')
      table.string('phone').notNullable().comment('Agent phone number')
      table
        .enum('tier', ['agent', 'super_agent', 'distributor', 'master'])
        .notNullable()
        .comment('Hierarchy level (4 tiers)')
      table
        .integer('parent_agent_id')
        .nullable()
        .unsigned()
        .comment('FK to parent agent (NULL if tier=master)')
      table.string('region', 100).nullable().comment('Geographic region (for geofencing)')
      table
        .enum('status', ['pending_approval', 'active', 'suspended', 'terminated'])
        .notNullable()
        .defaultTo('pending_approval')
      table.integer('wallet_id').nullable().unsigned().comment('FK to wallets (agent float wallet)')
      table
        .decimal('commission_rate', 5, 2)
        .notNullable()
        .defaultTo(2.5)
        .comment('Commission percentage (2.5% = 2.50)')
      table.timestamp('approved_at').nullable().comment('When agent was approved')
      table.integer('approved_by').nullable().unsigned().comment('FK to internal_users (approver)')
      table.timestamp('suspended_at').nullable().comment('When agent was suspended')
      table.string('suspension_reason').nullable().comment('Reason for suspension')
      table.timestamp('terminated_at').nullable().comment('When agent was terminated')
      table.string('termination_reason').nullable().comment('Reason for termination')
      table.timestamps()

      // Indexes
      table.index(['code'])
      table.index(['tier'])
      table.index(['status'])
      table.index(['parent_agent_id'])
      table.index(['region'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
