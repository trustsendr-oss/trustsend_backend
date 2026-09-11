import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Dedicated token table for Business — NOT shared with auth_access_tokens, which has a hard FK
 * to users(id). DbAccessTokensProvider.forModel() defaults to that shared table unless given an
 * explicit `table` option; reusing it for a non-User model either violates the FK or silently
 * attaches the token to an unrelated users row that happens to share the same id.
 */
export default class extends BaseSchema {
  protected tableName = 'business_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .onDelete('CASCADE')

      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
