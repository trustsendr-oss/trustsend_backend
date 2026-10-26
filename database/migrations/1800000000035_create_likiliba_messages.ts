import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The group conversation of a likiliba: members write to one another, and the group's own
 * events (contributions, payouts, lateness) are interleaved in the same feed.
 *
 * - likiliba_messages: what members wrote. A message deleted by its author keeps its body for
 *   the audit trail but is no longer shown; one hidden by Reemite support likewise.
 * - likiliba_message_reports: one report per member and message, read by support.
 * - likiliba_members.last_read_at: where each member stopped reading, for the unread count.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('likiliba_messages', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.text('body').notNullable()
      table.timestamp('deleted_at').nullable()
      table.timestamp('hidden_at').nullable()
      table.integer('hidden_by_internal_user_id').unsigned().nullable()
      table.text('hide_reason').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['likiliba_id', 'created_at'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_messages
        ADD CONSTRAINT likiliba_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 1000);
    `)

    this.schema.createTable('likiliba_message_reports', (table) => {
      table.increments('id')
      table
        .integer('message_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_messages')
        .onDelete('CASCADE')
      table
        .integer('reporter_member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.text('reason').notNullable()
      table.timestamp('resolved_at').nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['message_id', 'reporter_member_id'])
    })

    this.schema.alterTable('likiliba_members', (table) => {
      table.timestamp('last_read_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable('likiliba_members', (table) => {
      table.dropColumn('last_read_at')
    })
    this.schema.dropTable('likiliba_message_reports')
    this.schema.dropTable('likiliba_messages')
  }
}
