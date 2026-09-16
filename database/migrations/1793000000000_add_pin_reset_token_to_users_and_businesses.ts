import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backs the self-service "forgot PIN" flow (pin_controller.ts / business_dashboard/pin_controller.ts):
 * before this, there was no way to reset a PIN at all — not self-service (no route existed
 * despite PIN_SECURITY.md documenting one), and not even an admin override (unlike
 * InternalUsersController.resetPassword() for staff). A user who forgot their PIN was
 * permanently unable to move money.
 *
 * The token itself is never stored — only its SHA-256 hash (fast hash is fine here: the token is
 * 32 random bytes, i.e. 256 bits of entropy, not a low-entropy secret like a password) — so a DB
 * read alone can't be used to reset someone's PIN.
 */
export default class extends BaseSchema {
  async up() {
    for (const tableName of ['users', 'businesses']) {
      this.schema.alterTable(tableName, (table) => {
        table
          .string('pin_reset_token_hash', 64)
          .nullable()
          .comment('SHA-256 hex of the pending PIN reset token, if any')
        table
          .timestamp('pin_reset_expires_at')
          .nullable()
          .comment('Reset token expires after this — single-use, short-lived')
      })
    }
  }

  async down() {
    for (const tableName of ['users', 'businesses']) {
      this.schema.alterTable(tableName, (table) => {
        table.dropColumn('pin_reset_token_hash')
        table.dropColumn('pin_reset_expires_at')
      })
    }
  }
}
