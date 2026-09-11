import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    // Add check constraint for commission_rate (0-100%)
    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT commission_rate_range
       CHECK (commission_rate >= 0 AND commission_rate <= 100)`
    )

    // Add tier hierarchy constraint: agents without parent should have proper tier
    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT tier_parent_hierarchy
       CHECK (
         (parent_agent_id IS NULL AND tier IN ('master', 'distributor')) OR
         (parent_agent_id IS NOT NULL AND tier IN ('agent', 'super_agent', 'distributor'))
       )`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT commission_rate_range`)
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT tier_parent_hierarchy`)
  }
}
