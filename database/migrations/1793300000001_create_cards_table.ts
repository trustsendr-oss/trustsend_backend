import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A virtual/physical card issued via a provider (Payscribe). Mirrors wallets' ownership pattern
 * (nullable user_id/business_id + single-owner CHECK) since a card, like a wallet, is a financial
 * instrument that belongs to exactly one owner.
 *
 * `wallet_id` is the funding source: creating/topping-up a card debits this wallet (see
 * CardService), withdrawing from a card credits it back. Card issuance is USD-only today (per
 * Payscribe's docs), so this must reference a USD wallet.
 *
 * `balance_cache` is best-effort/display-only, NOT authoritative — same caveat as
 * MOBILE_MONEY_CLEARING in mobile_money_reconciliation_service.ts. The real spendable balance and
 * every POS/online spend transaction live entirely on Payscribe's side; this table only tracks
 * the money that moved between our own wallet and their clearing account (fund/withdraw), not
 * card spend itself — see card_service.ts and app/controllers/cards_controller.ts.
 */
export default class extends BaseSchema {
  protected tableName = 'cards'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').nullable().unsigned().comment('FK to users if owner is a user')
      table
        .integer('business_id')
        .nullable()
        .unsigned()
        .comment('FK to businesses if owner is a business')
      table
        .integer('wallet_id')
        .notNullable()
        .unsigned()
        .comment('FK to wallets — the funding source debited/credited on card fund/withdraw')
      table.string('provider', 30).notNullable().defaultTo('payscribe')
      table
        .string('provider_card_id', 100)
        .nullable()
        .comment('Set once the provider confirms creation')
      table.string('brand', 20).notNullable().comment('VISA or MASTERCARD')
      table.string('card_type', 20).notNullable().defaultTo('virtual')
      table.string('currency_code', 3).notNullable().defaultTo('USD')
      table
        .enum('status', ['pending', 'active', 'frozen', 'terminated', 'failed'])
        .notNullable()
        .defaultTo('pending')
      table.string('first_six', 6).nullable()
      table.string('last_four', 4).nullable()
      table.string('masked', 30).nullable()
      table
        .bigInteger('balance_cache')
        .notNullable()
        .defaultTo(0)
        .comment('Display-only — see class doc comment')
      table.string('failure_reason').nullable()
      table.timestamps()

      this.schema.raw(
        `ALTER TABLE ${this.tableName} ADD CONSTRAINT cards_single_owner
       CHECK ((user_id IS NOT NULL)::int + (business_id IS NOT NULL)::int = 1)`
      )

      table.index(['user_id'])
      table.index(['business_id'])
      table.index(['wallet_id'])
      table.index(['status'])
      table.unique(['provider', 'provider_card_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
