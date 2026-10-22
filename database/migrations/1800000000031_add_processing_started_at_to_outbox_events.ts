import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * When the relay took an event. An event left in `processing` long after this — its worker was
 * killed mid-delivery — goes back to the queue instead of blocking forever (see
 * outbox_relay_job.ts).
 */
export default class extends BaseSchema {
  protected tableName = 'outbox_events'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('processing_started_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('processing_started_at')
    })
  }
}
