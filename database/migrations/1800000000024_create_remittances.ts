import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * International transfers into the DRC ("remittances").
 *
 * A sender abroad pays from their Reemite wallet — funded, for instance, by mobile money in
 * their own country — and a beneficiary in the DRC receives the money in cash at any agent, or on
 * their Reemite wallet. See app/services/remittances/remittance_service.ts.
 *
 * - remittance_quotes: the rate and fees shown to the sender, locked for a few minutes.
 * - remittances: the transfer itself. The pickup code is stored twice, for two different jobs:
 *   an HMAC for lookups at the counter (the code itself is never searchable) and an encrypted
 *   copy so the sender can see it again in the app.
 * - watchlist_entries: names to hold for compliance review before any payout (sanctions lists).
 * - two admin-editable fee schedules: the sender's fee and the paying agent's commission.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('remittance_quotes', (table) => {
      table.string('id', 40).primary()
      table.integer('sender_user_id').unsigned().notNullable().references('id').inTable('users')
      table.integer('source_wallet_id').unsigned().notNullable().references('id').inTable('wallets')
      table.string('source_currency', 3).notNullable()
      table.string('payout_currency', 3).notNullable()
      table.bigInteger('send_amount').notNullable().comment('Principal, source currency')
      table.bigInteger('fee').notNullable().comment('Sender fee, source currency')
      table.bigInteger('payout_amount').notNullable().comment('Guaranteed to the beneficiary')
      table.bigInteger('fx_margin').notNullable().defaultTo(0).comment('Payout currency')
      table.string('mid_rate').nullable()
      table.string('rate').nullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['sender_user_id'])
    })

    this.schema.createTable('remittances', (table) => {
      table.string('id', 40).primary().comment('REM-XXXXXXXX')
      table.integer('sender_user_id').unsigned().notNullable().references('id').inTable('users')
      table.integer('source_wallet_id').unsigned().notNullable().references('id').inTable('wallets')
      table.string('sender_country', 2).notNullable().comment('ISO 3166-1 alpha-2, travel rule')
      table.string('sender_name').notNullable().comment('As verified at KYC, travel rule')

      table.string('source_currency', 3).notNullable()
      table.bigInteger('send_amount').notNullable()
      table.bigInteger('fee').notNullable()
      table.string('payout_currency', 3).notNullable()
      table.bigInteger('payout_amount').notNullable()
      table.bigInteger('fx_margin').notNullable().defaultTo(0)
      table.string('rate').nullable()

      table.enum('payout_method', ['cash_pickup', 'wallet']).notNullable()
      table.string('beneficiary_name').notNullable()
      table.string('beneficiary_phone', 20).notNullable().comment('Normalised MSISDN, 243…')
      table.string('beneficiary_city').nullable()
      table
        .integer('beneficiary_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .comment('Wallet payout only')
      table.string('purpose').nullable()

      table.string('pickup_code_hash', 64).nullable().unique()
      table.text('pickup_code_encrypted').nullable()
      table.integer('verification_failures').notNullable().defaultTo(0)

      table
        .enum('status', [
          'held', // compliance hold (watchlist match) — not payable until released
          'awaiting_payout', // cash pickup, payable at any agent
          'paid',
          'cancelled',
          'expired',
          'rejected',
        ])
        .notNullable()
      table.string('hold_reason').nullable()
      table.string('failure_reason').nullable()

      table.integer('paid_by_agent_id').unsigned().nullable().references('id').inTable('agents')
      table.string('beneficiary_id_type').nullable()
      table.string('beneficiary_id_number').nullable()
      table.timestamp('paid_at').nullable()
      table.timestamp('expires_at').notNullable()

      table.string('send_transaction_id').nullable()
      table.string('payout_transaction_id').nullable()
      table.string('refund_transaction_id').nullable()
      table.string('idempotency_key').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['sender_user_id'])
      table.index(['status'])
      table.unique(['sender_user_id', 'idempotency_key'])
    })

    this.schema.createTable('watchlist_entries', (table) => {
      table.increments('id')
      table.string('full_name').notNullable()
      table
        .string('normalized_name')
        .notNullable()
        .comment('Lower-case, accents stripped, sorted tokens')
      table.string('source').notNullable().comment('UN, OFAC, EU, internal…')
      table.string('reference').nullable()
      table.timestamp('created_at').notNullable()
      table.index(['normalized_name'])
    })

    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('fee_schedules')
        .insert([
          { operation_type: 'remittance', fee_percent: 3.0, created_at: now, updated_at: now },
          {
            operation_type: 'remittance_agent_commission',
            fee_percent: 1.0,
            created_at: now,
            updated_at: now,
          },
        ])
        .onConflict('operation_type')
        .ignore()
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('fee_schedules')
        .whereIn('operation_type', ['remittance', 'remittance_agent_commission'])
        .delete()
    })
    this.schema.dropTable('watchlist_entries')
    this.schema.dropTable('remittances')
    this.schema.dropTable('remittance_quotes')
  }
}
