import { BaseSchema } from '@adonisjs/lucid/schema'
import env from '#start/env'

/**
 * Replaces the hardcoded fee percentages in config/mobile_money.ts and config/cards.ts (read
 * once from env at boot, never admin-editable) with a DB-backed schedule the admin panel can
 * change at runtime — see FeeScheduleService, which is now the single place every fee-charging
 * service reads from. Seeded below with whatever the env vars are set to at migration time, so
 * deploying this migration doesn't silently change any currently-charged fee.
 */
export default class extends BaseSchema {
  protected tableName = 'fee_schedules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('operation_type', 50).notNullable().unique()
      table.decimal('fee_percent', 5, 2).notNullable().defaultTo(0)
      table.integer('updated_by').unsigned().nullable().references('id').inTable('internal_users')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT fee_percent_range
       CHECK (fee_percent >= 0 AND fee_percent <= 100)`
    )

    this.defer(async (db) => {
      const now = new Date()
      await db.table(this.tableName).insert([
        {
          operation_type: 'mobile_money_deposit',
          fee_percent: Number(env.get('MOBILE_MONEY_DEPOSIT_FEE_PERCENT', '0')),
          created_at: now,
          updated_at: now,
        },
        {
          operation_type: 'mobile_money_payout',
          fee_percent: Number(env.get('MOBILE_MONEY_PAYOUT_FEE_PERCENT', '0')),
          created_at: now,
          updated_at: now,
        },
        {
          operation_type: 'card_issuance',
          fee_percent: Number(env.get('CARD_ISSUANCE_FEE_PERCENT', '0')),
          created_at: now,
          updated_at: now,
        },
        {
          operation_type: 'card_topup',
          fee_percent: Number(env.get('CARD_TOPUP_FEE_PERCENT', '0')),
          created_at: now,
          updated_at: now,
        },
      ])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
