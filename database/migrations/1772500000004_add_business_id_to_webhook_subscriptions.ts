import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_subscriptions'

  async up() {
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ALTER COLUMN user_id DROP NOT NULL;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.integer('business_id').nullable().unsigned().comment('FK to businesses if owner is a business')
      table.foreign('business_id').references('businesses.id').onDelete('CASCADE')
      table.index(['business_id'])
      table.unique(['business_id', 'url'])
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT webhook_subscriptions_single_owner
      CHECK ((user_id IS NOT NULL)::int + (business_id IS NOT NULL)::int = 1);
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT webhook_subscriptions_single_owner;
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['business_id', 'url'])
      table.dropForeign(['business_id'])
      table.dropColumn('business_id')
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName} ALTER COLUMN user_id SET NOT NULL;
    `)
  }
}
