import { BaseSchema } from '@adonisjs/lucid/schema'
import env from '#start/env'

/**
 * Wallet top-ups by bank card (GoFreshPay Microform, see app/services/card_payments/).
 *
 * A session is the checkout attempt, from the amount chosen in the app to the charge. It is kept
 * apart from ledger_transactions on purpose: most checkouts are abandoned before any card is
 * charged, and a pending ledger row for each of them would fill the user's history with top-ups
 * that never happened. The ledger row is written only when the charge is sent (see
 * CardDepositService.charge), and the session points to it.
 *
 * No card number ever reaches us: the card fields are CyberSource iframes. Only what GoFreshPay
 * reports back (scheme, last four digits, issuer, BIN country) is stored, for the receipt and for
 * disputes.
 */
export default class extends BaseSchema {
  protected tableName = 'card_deposit_sessions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.uuid('id').primary()
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
      table.integer('wallet_id').unsigned().notNullable().references('id').inTable('wallets')
      // Hundredths of the currency, like every amount in this codebase.
      table.bigInteger('amount').notNullable()
      table.string('currency_code', 3).notNullable()
      // Ours, sent as `merchant_reference`: what GoFreshPay's reports and support refer to.
      table.string('merchant_reference', 40).notNullable().unique()
      // Theirs, from capture-context: required on every later call, and what webhooks carry.
      table.string('gateway_transaction_uuid', 80).nullable().unique()
      // SHA-256 of the one-time token the checkout page authenticates with. The token itself
      // only ever exists in the URL fragment handed to the app.
      table.string('checkout_token_hash', 64).notNullable()
      table.string('status', 20).notNullable().defaultTo('created')
      table.string('authentication_transaction_id', 80).nullable()
      table
        .string('ledger_transaction_id', 40)
        .nullable()
        .references('id')
        .inTable('ledger_transactions')
      table.string('card_scheme', 40).nullable()
      table.string('card_last4', 4).nullable()
      table.string('card_issuer', 120).nullable()
      table.string('card_bin_country', 2).nullable()
      table.string('failure_code', 40).nullable()
      table.string('failure_message', 255).nullable()
      table.jsonb('metadata').notNullable().defaultTo('{}')
      table.timestamp('expires_at').notNullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      table.index(['user_id', 'created_at'])
      table.index(['status', 'expires_at'])
    })

    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT card_deposit_sessions_status_check
       CHECK (status IN ('created', 'authenticating', 'challenge', 'charging', 'completed', 'failed', 'expired'))`
    )
    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT card_deposit_sessions_amount_check CHECK (amount > 0)`
    )

    // Same seeding rule as fee_schedules itself: whatever the env says at migration time, so
    // deploying this changes no rate, and the admin-edited value wins from then on.
    this.defer(async (db) => {
      const exists = await db.from('fee_schedules').where('operation_type', 'card_deposit').first()
      if (!exists) {
        await db.table('fee_schedules').insert({
          operation_type: 'card_deposit',
          fee_percent: Number(env.get('CARD_DEPOSIT_FEE_PERCENT', '0')) || 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.defer(async (db) => {
      await db.from('fee_schedules').where('operation_type', 'card_deposit').delete()
    })
  }
}
