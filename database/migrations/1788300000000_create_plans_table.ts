import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .string('code', 50)
        .notNullable()
        .unique()
        .comment('Stable identifier used by API/admin calls, e.g. "starter"')
      table.string('name').notNullable()
      table.text('description').nullable()
      table
        .jsonb('features')
        .notNullable()
        .defaultTo('[]')
        .comment('Array of feature keys this plan grants, e.g. ["mobile_money.deposits"]')
      table.enum('status', ['active', 'archived']).notNullable().defaultTo('active')
      table.timestamps()
    })

    // Every business must resolve to a plan (see businesses.plan_id, added in the next
    // migration) — seeding this here, before that column exists and gets backfilled, means
    // there's never a window where a business could reference a plan that doesn't exist yet.
    // Grants every feature key gated by middleware.businessPlan() as of this migration, so
    // existing businesses see no behavior change until an admin deliberately assigns a more
    // restrictive plan.
    // Runs inside defer() — this.schema.createTable() above is only queued, not executed yet,
    // so an immediate insert would hit a table that doesn't exist.
    this.defer(async (db) => {
      await db.table(this.tableName).insert({
        code: 'default',
        name: 'Default',
        description: 'Full access — assigned automatically until an admin sets a more restrictive plan.',
        features: JSON.stringify([
          'mobile_money.deposits',
          'mobile_money.payouts',
          'webhooks',
          'wallet.multi_currency',
          'mobile_money.toolkit',
        ]),
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
