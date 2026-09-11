import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fixes a pre-existing bug: InternalUser.accessTokens = DbAccessTokensProvider.forModel(InternalUser)
 * was called without a `table` option, so it silently wrote into auth_access_tokens — which has
 * a hard FK to users(id). Every internal_user login either violated that FK (login fails) or,
 * worse, coincidentally matched an unrelated users row. This gives InternalUser its own table,
 * same fix as business_access_tokens.
 */
export default class extends BaseSchema {
  protected tableName = 'internal_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('internal_users')
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
