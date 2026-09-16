import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Maps a TumaPlus owner (user or business) to their Payscribe "customer" — Payscribe requires a
 * customer_id to exist before any card can be issued to them. Created lazily, once, on first
 * card request (see CardService.ensureProviderCustomer), then reused for every subsequent card.
 * Separate from `cards` since one customer can hold multiple cards.
 */
export default class extends BaseSchema {
  protected tableName = 'card_customers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').nullable().unsigned().comment('FK to users if owner is a user')
      table
        .integer('business_id')
        .nullable()
        .unsigned()
        .comment('FK to businesses if owner is a business')
      table.string('provider', 30).notNullable().defaultTo('payscribe')
      table.string('provider_customer_id', 100).notNullable()
      table.timestamps()

      this.schema.raw(
        `ALTER TABLE ${this.tableName} ADD CONSTRAINT card_customers_single_owner
       CHECK ((user_id IS NOT NULL)::int + (business_id IS NOT NULL)::int = 1)`
      )

      table.unique(['user_id', 'provider'])
      table.unique(['business_id', 'provider'])
      table.unique(['provider', 'provider_customer_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
