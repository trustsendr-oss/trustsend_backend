import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Wave-style pricing: cash in and cash out are free for the customer, person-to-person transfers
 * carry the fee that pays for the network, and agents are paid once a day on the volume of cash
 * they handled — see AgentCommissionService.
 *
 * `agent_commission_payouts` is the ledger of those daily payments: one row per agent, business
 * day and currency. The unique key is what makes the daily job safe to run every hour and to
 * re-run after a crash: a day already paid is never paid twice.
 */
export default class extends BaseSchema {
  protected tableName = 'agent_commission_payouts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('agents')
        .onDelete('RESTRICT')
      table.date('business_day').notNullable().comment('Calendar day in Africa/Kigali time')
      table.string('currency_code', 3).notNullable()
      table.bigInteger('volume').notNullable().comment('Cash in + cash out counted, minor units')
      table
        .bigInteger('excluded_volume')
        .notNullable()
        .defaultTo(0)
        .comment('Round trips left out of the volume, minor units')
      table.decimal('rate_percent', 6, 3).notNullable()
      table.bigInteger('commission').notNullable()
      table.string('ledger_transaction_id').nullable()
      table.timestamp('created_at').notNullable()

      table.unique(['agent_id', 'business_day', 'currency_code'])
    })

    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('fee_schedules')
        .insert([
          { operation_type: 'p2p_transfer', fee_percent: 1.0, created_at: now, updated_at: now },
          {
            operation_type: 'agent_cash_volume_commission',
            fee_percent: 0.5,
            created_at: now,
            updated_at: now,
          },
        ])
        .onConflict('operation_type')
        .ignore()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.defer(async (db) => {
      await db
        .from('fee_schedules')
        .whereIn('operation_type', ['p2p_transfer', 'agent_cash_volume_commission'])
        .delete()
    })
  }
}
