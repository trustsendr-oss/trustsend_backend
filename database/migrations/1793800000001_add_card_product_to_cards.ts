import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Links a card to the category it was sold under.
 *
 * Nullable on purpose: cards issued before the catalogue existed have no category, and inventing
 * one for them would claim they were sold under terms that did not exist. Enforcement reads the
 * category off the card, so a card without one keeps the unrestricted behaviour it was created
 * with.
 *
 * The category is recorded on the card rather than looked up live: archiving or repricing a
 * category must not retroactively change what an existing cardholder is entitled to.
 */
export default class extends BaseSchema {
  protected tableName = 'cards'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('card_product_id')
        .nullable()
        .references('id')
        .inTable('card_products')
        .comment('Category this card was sold under; null for cards issued before the catalogue')
      table.index(['card_product_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('card_product_id')
    })
  }
}
