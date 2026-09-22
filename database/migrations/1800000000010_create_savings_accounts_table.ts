import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Someone's savings with a partner institution.
 *
 * ## Where the money sits
 *
 * In an escrow wallet owned by the SAVER, not by the institution. The alternative — crediting the
 * institution's own wallet, which is what a deposit literally is on its books — would put the
 * saver's money in the hands of a company TumaPlus does not control, and an institution that
 * failed would take those deposits with it while carrying our name on the app the saver used.
 *
 * Keeping it a `wallets` row with owner_type `user_wallet` is what makes that safe rather than
 * merely well-intentioned: LedgerService row-locks those accounts and refuses to let them go
 * negative, where a platform_internal ledger account would carry a best-effort running total it
 * documents as unsuitable for exactly this. Migration 1800000000002 made the second wallet
 * possible; this is what it was for.
 *
 * The institution sees the balance and earns on it. It never holds it.
 *
 * ## Why the terms are copied
 *
 * `interest_rate_bps` and `interest_period` are frozen here at opening rather than read from the
 * product. Repricing a product must never retroactively change what an existing saver was
 * promised — the same rule cards already follow by recording the category they were sold under
 * (1793800000001), and the reason financial_products are archived rather than deleted.
 */
export default class extends BaseSchema {
  protected tableName = 'savings_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('product_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('financial_products')
      table
        .integer('provider_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .comment('Denormalised from the product so an institution can list its book without a join')
      table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
      table
        .integer('wallet_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('wallets')
        .comment('The escrow wallet holding the balance — one per account, never shared')
      table.string('currency_code', 3).notNullable()

      table
        .enum('status', ['active', 'matured', 'closed'])
        .notNullable()
        .defaultTo('active')
        .comment('matured: a term deposit past its date, withdrawable but no longer accruing')

      table.timestamp('opened_at').notNullable()
      table
        .timestamp('matures_at')
        .nullable()
        .comment('Term deposits only; null means withdrawable at any time')
      table.timestamp('closed_at').nullable()

      table
        .integer('interest_rate_bps')
        .notNullable()
        .comment('Copied from the product at opening; repricing must not reach existing savers')
      table.enum('interest_period', ['month', 'year']).notNullable()

      table.timestamps()

      // One escrow wallet backs exactly one account: a shared one could not be reconciled to
      // either, and closing one would empty the other.
      table.unique(['wallet_id'])
      table.index(['user_id'])
      table.index(['provider_id'])
      table.index(['product_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
