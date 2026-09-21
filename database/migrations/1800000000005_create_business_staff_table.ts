import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The people who work for a partner institution, and which of its counters they sit at.
 *
 * A teller is not the counter. `agents` models the outlet — its float, its location, its devices;
 * this table models the person operating it. Without the distinction a cash discrepancy can be
 * traced to a window but never to whoever was standing at it, which is the first question a
 * microfinance director asks and the reason they pay for the system at all.
 *
 * A staff member is an ordinary `users` row, exactly as an agent is (`agents.user_id`, resolved by
 * AgentIdentityService). That reuses the whole authentication stack — login, PIN, lockout — instead
 * of standing up a fourth token table, and it matches reality: a teller at a microfinance
 * institution is very often also one of its customers.
 *
 * `agent_id` is nullable because not every role sits at a window: a branch manager or a credit
 * officer belongs to the institution without being posted to one counter.
 *
 * Named business_staff rather than imf_staff — a bank or a cooperative will use the same table,
 * for the same reason `businesses.kind` covers them rather than a table apiece.
 *
 * Roles are recorded but nothing enforces them yet; that arrives with the routes they gate.
 */
export default class extends BaseSchema {
  protected tableName = 'business_staff'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('business_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .comment('The institution this person works for')
      table
        .integer('user_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .comment('The account they authenticate with, same pattern as agents.user_id')
      table
        .integer('agent_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('agents')
        .comment('Counter they are posted to; null for roles not tied to one')
      table
        .enum('role', ['teller', 'credit_officer', 'branch_manager', 'admin'])
        .notNullable()
        .comment('What they are allowed to do once routes start gating on it')
      table.enum('status', ['active', 'suspended', 'terminated']).notNullable().defaultTo('active')
      table.timestamps()

      // One membership per person per institution — a teller promoted to branch manager has their
      // role changed, not a second row that would make "what is this person allowed to do" ambiguous.
      table.unique(['business_id', 'user_id'])
      table.index(['business_id'])
      table.index(['user_id'])
      table.index(['agent_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
