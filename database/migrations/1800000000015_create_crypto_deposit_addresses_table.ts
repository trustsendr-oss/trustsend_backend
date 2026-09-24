import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'crypto_deposit_addresses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('business_id').unsigned().nullable().references('id').inTable('businesses').onDelete('CASCADE')
      table.integer('wallet_id').unsigned().notNullable().references('id').inTable('wallets').onDelete('CASCADE')
      table.string('network', 30).notNullable().comment('e.g. polygon, base, arbitrum, ethereum, optimism')
      table.string('token_symbol', 10).notNullable().defaultTo('USDC').comment('e.g. USDC, USDT')
      table.string('address', 100).notNullable().comment('Public deposit address')
      table.string('memo_tag', 50).nullable().comment('Optional destination memo / tag')
      table.enum('status', ['active', 'revoked']).notNullable().defaultTo('active')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['address', 'network'])
      table.index(['user_id', 'network', 'token_symbol'])
      table.index(['business_id', 'network', 'token_symbol'])
    })

    // Seed fee schedules for crypto operations if fee_schedules exists
    this.defer(async (db) => {
      const exists = await db.schema.hasTable('fee_schedules')
      if (exists) {
        const now = new Date()
        const operations = [
          { operation_type: 'crypto_deposit', fee_percent: 0, created_at: now, updated_at: now },
          { operation_type: 'crypto_payout', fee_percent: 0, created_at: now, updated_at: now },
        ]
        for (const op of operations) {
          const row = await db.from('fee_schedules').where('operation_type', op.operation_type).first()
          if (!row) {
            await db.table('fee_schedules').insert(op)
          }
        }
      }
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
