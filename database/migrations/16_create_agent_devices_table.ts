import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agent_devices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('agent_id').notNullable().unsigned().comment('FK to agents')
      table.string('device_fingerprint', 255).notNullable().comment('Device fingerprint (hardware ID hash)')
      table
        .enum('status', ['active', 'revoked'])
        .notNullable()
        .defaultTo('active')
      table.timestamp('registered_at').notNullable().comment('When device was registered')
      table.timestamp('last_used_at').nullable().comment('Last usage timestamp')
      table.timestamps()

      // Indexes
      table.index(['agent_id'])
      table.index(['device_fingerprint'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
