import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'internal_users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('email').notNullable().unique()
      table.string('full_name').notNullable()
      table.string('password').notNullable()
      table.enum('status', ['active', 'inactive', 'suspended']).notNullable().defaultTo('active')
      table.boolean('must_change_password').notNullable().defaultTo(false)
      table.boolean('mfa_enabled').notNullable().defaultTo(false)
      table.string('mfa_secret_encrypted').nullable()

      table.timestamps()

      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
