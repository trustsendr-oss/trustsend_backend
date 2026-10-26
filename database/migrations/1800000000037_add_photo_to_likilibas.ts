import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A likiliba's group photo, set by its organiser. Stored like profile photos (see
 * AvatarStorageService) and served to the group's members only.
 */
export default class extends BaseSchema {
  protected tableName = 'likilibas'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('photo_ref', 64).nullable()
      table.string('photo_mime_type', 32).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('photo_ref')
      table.dropColumn('photo_mime_type')
    })
  }
}
