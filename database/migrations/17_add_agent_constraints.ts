import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    // Add unique constraint on email
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['email'])
    })

    // Add unique constraint on agent_devices
    this.schema.alterTable('agent_devices', (table) => {
      table.unique(['agent_id', 'device_fingerprint'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['email'])
    })

    this.schema.alterTable('agent_devices', (table) => {
      table.dropUnique(['agent_id', 'device_fingerprint'])
    })
  }
}
