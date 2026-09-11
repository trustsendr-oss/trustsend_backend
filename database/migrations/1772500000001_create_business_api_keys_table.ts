import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'business_api_keys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('business_id').notNullable().unsigned().comment('FK to businesses')
      table
        .string('key_prefix', 16)
        .notNullable()
        .comment('First chars of the key, shown for identification — never the full secret')
      table.string('key_hash').notNullable().comment('Hashed full key (scrypt) — never store it in clear')
      table.enum('status', ['active', 'revoked']).notNullable().defaultTo('active')
      table.timestamp('last_used_at').nullable()
      table.timestamp('revoked_at').nullable()
      table.timestamps()

      table.index(['business_id'])
      table.index(['key_prefix'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
