import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Card products — the categories a card is sold under.
 *
 * Cards were issued free of charge: `createCard` only ever took a percentage fee that defaults
 * to 0 (see config/cards.ts). Selling them needs a priced catalogue, and that catalogue has to be
 * editable by staff rather than redeployed, which is why it is a table and not configuration.
 *
 * Shaped after `plans` (business subscriptions), down to `code` / `status` / archive-never-delete
 * — same problem, same solution, and the admin resource is the same shape too.
 *
 * Every limit here is one this codebase can actually enforce, because the money passes through
 * our own ledger: the price at issuance, the balance ceiling and the top-up caps when funding a
 * card, the card count at creation. Merchant-side spending caps are deliberately absent — the
 * provider exposes no endpoint to set them and purchases never touch our ledger, so a column for
 * them could only ever be decoration.
 */
export default class extends BaseSchema {
  protected tableName = 'card_products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .string('code', 50)
        .notNullable()
        .unique()
        .comment('Stable identifier used by API/admin calls, e.g. "standard"')
      table.string('name').notNullable()
      table.text('description').nullable()

      table
        .string('currency_code', 3)
        .notNullable()
        .defaultTo('USD')
        .comment('Currency of every amount below. Card issuing is USD-only today.')
      table
        .bigInteger('issuance_price')
        .notNullable()
        .defaultTo(0)
        .comment('Charged once, smallest unit. 0 keeps a category free.')

      // NULL means "no ceiling" throughout: a category that does not restrict something must be
      // distinguishable from one that restricts it to zero.
      table
        .bigInteger('max_balance')
        .nullable()
        .comment('Highest balance a card of this category may hold, smallest unit')
      table
        .integer('max_active_cards')
        .nullable()
        .comment('How many non-terminated cards of this category one holder may own')
      table.bigInteger('per_topup_limit').nullable().comment('Largest single top-up, smallest unit')
      table
        .bigInteger('daily_topup_limit')
        .nullable()
        .comment('Rolling 24h top-up total, smallest unit')
      table
        .bigInteger('monthly_topup_limit')
        .nullable()
        .comment('Rolling 30d top-up total, smallest unit')

      table.enum('status', ['active', 'archived']).notNullable().defaultTo('active')
      table.timestamps()

      table.index(['status'])
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName}
      ADD CONSTRAINT card_products_amounts_non_negative CHECK (
        issuance_price >= 0
        AND (max_balance IS NULL OR max_balance > 0)
        AND (max_active_cards IS NULL OR max_active_cards > 0)
        AND (per_topup_limit IS NULL OR per_topup_limit > 0)
        AND (daily_topup_limit IS NULL OR daily_topup_limit > 0)
        AND (monthly_topup_limit IS NULL OR monthly_topup_limit > 0)
      )
    `)

    // A free, unrestricted category, seeded so that cards created before this migration — and
    // any client that has not been updated to send a category yet — keep working exactly as they
    // did. Nothing changes for anyone until staff publish a priced category.
    this.defer(async (db) => {
      await db.table(this.tableName).insert({
        code: 'standard',
        name: 'Standard',
        description:
          'Catégorie par défaut, sans frais ni plafond. Conserve le comportement des cartes émises avant la mise en place du catalogue.',
        currency_code: 'USD',
        issuance_price: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
