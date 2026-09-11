import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agent_applications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('applicant_user_id').notNullable().unsigned().comment('FK to users (who applied)')
      table
        .enum('tier', ['agent', 'super_agent', 'distributor', 'master'])
        .notNullable()
        .comment('Tier being applied for')
      table
        .integer('sponsor_agent_id')
        .nullable()
        .unsigned()
        .comment('FK to agents (proposed parent/sponsor)')
      table
        .enum('status', ['submitted', 'under_review', 'approved', 'rejected'])
        .notNullable()
        .defaultTo('submitted')
      table.integer('reviewed_by').nullable().unsigned().comment('FK to internal_users (reviewer)')
      table.timestamp('reviewed_at').nullable().comment('When reviewed')
      table.string('rejection_reason').nullable().comment('If rejected, why?')
      table.timestamps()

      // Indexes
      table.index(['applicant_user_id'])
      table.index(['status'])
      table.index(['tier'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
