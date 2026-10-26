import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * An institution's logo, uploaded by the institution from its dashboard or by Reemite staff.
 * Shown in the app wherever the institution appears; public, like its published offers.
 */
export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('logo_ref', 64).nullable()
      table.string('logo_mime_type', 32).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('logo_ref')
      table.dropColumn('logo_mime_type')
    })
  }
}
