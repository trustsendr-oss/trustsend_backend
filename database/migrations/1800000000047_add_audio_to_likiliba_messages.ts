import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Voice messages in likiliba conversations: a new `audio` kind, stored like photos and files,
 * with the length the app recorded so the feed can show it before anything is downloaded.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('likiliba_messages', (table) => {
      table.integer('attachment_duration_ms').unsigned().nullable()
    })
    this.schema.raw(`
      ALTER TABLE likiliba_messages
        DROP CONSTRAINT likiliba_messages_kind_check,
        DROP CONSTRAINT likiliba_messages_body_check,
        DROP CONSTRAINT likiliba_messages_attachment_check,
        ADD CONSTRAINT likiliba_messages_kind_check
          CHECK (kind IN ('text', 'image', 'file', 'poll', 'audio')),
        ADD CONSTRAINT likiliba_messages_body_check CHECK (
          char_length(body) <= 1000 AND (kind IN ('image', 'file', 'audio') OR char_length(body) >= 1)
        ),
        ADD CONSTRAINT likiliba_messages_attachment_check CHECK (
          (kind IN ('image', 'file', 'audio')) = (attachment_ref IS NOT NULL)
        );
    `)
  }

  async down() {
    // Fails, on purpose, while voice messages exist: dropping them would lose what was sent.
    this.schema.raw(`
      ALTER TABLE likiliba_messages
        DROP CONSTRAINT likiliba_messages_kind_check,
        DROP CONSTRAINT likiliba_messages_body_check,
        DROP CONSTRAINT likiliba_messages_attachment_check,
        ADD CONSTRAINT likiliba_messages_kind_check
          CHECK (kind IN ('text', 'image', 'file', 'poll')),
        ADD CONSTRAINT likiliba_messages_body_check CHECK (
          char_length(body) <= 1000 AND (kind IN ('image', 'file') OR char_length(body) >= 1)
        ),
        ADD CONSTRAINT likiliba_messages_attachment_check CHECK (
          (kind IN ('image', 'file')) = (attachment_ref IS NOT NULL)
        );
    `)
    this.schema.alterTable('likiliba_messages', (table) => {
      table.dropColumn('attachment_duration_ms')
    })
  }
}
