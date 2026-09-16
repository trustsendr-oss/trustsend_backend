import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'wallets'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('business_id')
        .nullable()
        .unsigned()
        .comment('FK to businesses if owner is a business')
      table.index(['business_id'])
      table.unique(['business_id', 'currency_code'])
    })

    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT wallets_single_owner;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT wallets_single_owner
      CHECK (
        (user_id IS NOT NULL)::int + (agent_id IS NOT NULL)::int + (business_id IS NOT NULL)::int = 1
      );
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT wallets_single_owner;
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT wallets_single_owner
      CHECK ((user_id IS NOT NULL)::int + (agent_id IS NOT NULL)::int = 1);
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['business_id', 'currency_code'])
      table.dropColumn('business_id')
    })
  }
}
