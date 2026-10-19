import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Turns agent_applications into a usable intake: until now the table existed but nothing wrote
 * to it, and it only held a tier and a sponsor — not enough for anyone to judge an applicant.
 *
 * - The details a reviewer needs to decide (where the shop is, how to reach them, why).
 * - `approved_agent_id`: the agent record an approval created, so the two stay linked.
 * - One open application per person, enforced by the database: a double tap or two devices
 *   must not queue the same request twice.
 */
export default class extends BaseSchema {
  protected tableName = 'agent_applications'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('business_name').nullable().comment('Shop or outlet name proposed')
      table.string('phone', 20).nullable().comment('Contact number for the review')
      table.string('city').nullable()
      table.string('region').nullable()
      table.string('address').nullable()
      table.text('motivation').nullable().comment('Why the applicant wants to become an agent')
      table
        .integer('approved_agent_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('agents')
        .comment('Agent created when this application was approved')
    })

    this.schema.raw(
      `CREATE UNIQUE INDEX agent_applications_one_open_per_user
         ON agent_applications (applicant_user_id)
         WHERE status IN ('submitted', 'under_review')`
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS agent_applications_one_open_per_user')
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('approved_agent_id')
      table.dropColumn('motivation')
      table.dropColumn('address')
      table.dropColumn('region')
      table.dropColumn('city')
      table.dropColumn('phone')
      table.dropColumn('business_name')
    })
  }
}
