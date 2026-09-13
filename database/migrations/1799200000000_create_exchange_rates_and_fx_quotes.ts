import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Currency swaps between two wallets of the same owner.
 *
 * - `exchange_rates`: one row per currency, rate expressed per 1 USD. `market_rate` is refreshed
 *   from the international feed (ExchangeRateService); `manual_rate`, set from the admin panel,
 *   overrides it. `margin_bps` is the spread taken on a swap involving that currency.
 * - `fx_quotes`: a rate locked for a short time so the customer is charged exactly what was shown.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('exchange_rates', (table) => {
      table
        .string('currency_code', 3)
        .primary()
        .references('code')
        .inTable('currencies')
        .onDelete('CASCADE')
      table.decimal('market_rate', 30, 12).nullable()
      table.decimal('manual_rate', 30, 12).nullable()
      table.integer('margin_bps').notNullable().defaultTo(0)
      table.string('market_source', 100).nullable()
      table.timestamp('market_updated_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.raw(`
      ALTER TABLE exchange_rates
        ADD CONSTRAINT exchange_rates_market_rate_positive CHECK (market_rate IS NULL OR market_rate > 0),
        ADD CONSTRAINT exchange_rates_manual_rate_positive CHECK (manual_rate IS NULL OR manual_rate > 0),
        ADD CONSTRAINT exchange_rates_margin_range CHECK (margin_bps BETWEEN 0 AND 2000)
    `)

    this.schema.createTable('fx_quotes', (table) => {
      table.uuid('id').primary()
      table.string('owner_type', 20).notNullable()
      table.integer('owner_id').notNullable()
      table.integer('from_wallet_id').notNullable().references('id').inTable('wallets')
      table.integer('to_wallet_id').notNullable().references('id').inTable('wallets')
      table.string('from_currency', 3).notNullable()
      table.string('to_currency', 3).notNullable()
      table.bigInteger('amount_in').notNullable()
      table.bigInteger('amount_out').notNullable()
      table.bigInteger('fee').notNullable()
      table.decimal('mid_rate', 30, 12).notNullable()
      table.decimal('rate', 30, 12).notNullable()
      table.integer('margin_bps').notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('used_at').nullable()
      table.string('ledger_transaction_id', 12).nullable().references('id').inTable('ledger_transactions')
      table.timestamp('created_at').notNullable()

      table.index(['owner_type', 'owner_id', 'created_at'])
    })

    this.schema.raw(`
      ALTER TABLE fx_quotes
        ADD CONSTRAINT fx_quotes_owner_type_check CHECK (owner_type IN ('user', 'business')),
        ADD CONSTRAINT fx_quotes_distinct_currencies CHECK (from_currency <> to_currency),
        ADD CONSTRAINT fx_quotes_amounts_positive CHECK (amount_in > 0 AND amount_out > 0 AND fee >= 0)
    `)

    // USD is the base every other rate is expressed against.
    this.defer(async (db) => {
      const now = new Date()
      await db.table('exchange_rates').insert({
        currency_code: 'USD',
        market_rate: 1,
        market_source: 'base',
        market_updated_at: now,
        created_at: now,
        updated_at: now,
      })
    })
  }

  async down() {
    this.schema.dropTable('fx_quotes')
    this.schema.dropTable('exchange_rates')
  }
}
