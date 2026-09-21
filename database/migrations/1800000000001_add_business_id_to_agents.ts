import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Which institution an agent belongs to, so `agents` can carry a partner's branch network as
 * well as TumaPlus's own.
 *
 * An IMF counter is operationally the same thing as an agent and already needs everything the
 * table provides: a float wallet (the digital twin of the cash drawer), a physical location,
 * approval/suspension lifecycle, per-agent caps, registered devices, and a hierarchy. CashInService
 * /CashOutService then work unchanged for counter deposits and withdrawals — the float is debited
 * when cash comes in over the counter, credited when it goes out.
 *
 * Null means the agent belongs to TumaPlus's own network, which is every agent that exists today.
 *
 * `agents.code` stays globally unique rather than unique per business: DirectoryController resolves
 * a 9-digit code with no tenant context, so two institutions must never be able to mint the same one.
 *
 * No ON DELETE: a business is retired by moving its status to `terminated`, never hard-deleted, so
 * the default (restrict) is the correct answer — it refuses to silently orphan a branch network.
 */
export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('business_id')
        .nullable()
        .unsigned()
        .comment('FK to businesses when this agent is a partner branch; null = TumaPlus network')
      table.foreign('business_id').references('businesses.id')
      table.index(['business_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['business_id'])
      table.dropColumn('business_id')
    })
  }
}
