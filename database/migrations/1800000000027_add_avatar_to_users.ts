import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Profile photo chosen by the account holder. Only a reference is stored: the bytes live under
 * storage/avatars/ (see AvatarStorageService), named by a random UUID unrelated to the user id.
 * Both columns are null for an account without a photo — the apps then show the initials.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('avatar_ref', 36).nullable()
      table.string('avatar_mime_type', 32).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('avatar_ref')
      table.dropColumn('avatar_mime_type')
    })
  }
}
