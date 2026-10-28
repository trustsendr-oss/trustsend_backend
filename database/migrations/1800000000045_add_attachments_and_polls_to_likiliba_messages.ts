import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A likiliba message can now carry a photo, a file or a poll, besides text.
 *
 * - likiliba_messages.kind: 'text', 'image', 'file' or 'poll'. The body stays the text of the
 *   message — the caption of a photo or file (which may be empty), the question of a poll.
 * - attachment_*: the stored file of an image or file message. Like the body, it is kept when
 *   the message is deleted or hidden, for support.
 * - likiliba_poll_options / likiliba_poll_votes: the choices of a poll and one vote per member.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('likiliba_messages', (table) => {
      table.string('kind', 8).notNullable().defaultTo('text')
      table.string('attachment_ref', 36).nullable()
      table.string('attachment_mime_type', 128).nullable()
      table.string('attachment_name', 255).nullable()
      table.integer('attachment_size').unsigned().nullable()
      table.timestamp('poll_closed_at').nullable()
    })

    this.schema.raw(`
      ALTER TABLE likiliba_messages
        DROP CONSTRAINT likiliba_messages_body_check,
        ADD CONSTRAINT likiliba_messages_kind_check CHECK (kind IN ('text', 'image', 'file', 'poll')),
        ADD CONSTRAINT likiliba_messages_body_check CHECK (
          char_length(body) <= 1000 AND (kind IN ('image', 'file') OR char_length(body) >= 1)
        ),
        ADD CONSTRAINT likiliba_messages_attachment_check CHECK (
          (kind IN ('image', 'file')) = (attachment_ref IS NOT NULL)
        );
    `)

    this.schema.createTable('likiliba_poll_options', (table) => {
      table.increments('id')
      table
        .integer('message_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_messages')
        .onDelete('CASCADE')
      table.string('label', 100).notNullable()
      table.smallint('position').notNullable()

      table.unique(['message_id', 'position'])
    })

    this.schema.createTable('likiliba_poll_votes', (table) => {
      table.increments('id')
      table
        .integer('message_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_messages')
        .onDelete('CASCADE')
      table
        .integer('option_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_poll_options')
        .onDelete('CASCADE')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['message_id', 'member_id'])
    })
  }

  async down() {
    this.schema.dropTable('likiliba_poll_votes')
    this.schema.dropTable('likiliba_poll_options')
    // Fails, on purpose, while photo or file messages exist: their empty bodies would break the
    // original check, and dropping them would lose what members sent.
    this.schema.raw(`
      ALTER TABLE likiliba_messages
        DROP CONSTRAINT likiliba_messages_attachment_check,
        DROP CONSTRAINT likiliba_messages_body_check,
        DROP CONSTRAINT likiliba_messages_kind_check,
        ADD CONSTRAINT likiliba_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 1000);
    `)
    this.schema.alterTable('likiliba_messages', (table) => {
      table.dropColumn('poll_closed_at')
      table.dropColumn('attachment_size')
      table.dropColumn('attachment_name')
      table.dropColumn('attachment_mime_type')
      table.dropColumn('attachment_ref')
      table.dropColumn('kind')
    })
  }
}
