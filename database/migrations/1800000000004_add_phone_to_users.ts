import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A contact number for holders who have no e-mail address.
 *
 * Someone enrolled at an IMF counter has no smartphone and usually no e-mail (see
 * 1800000000003), but nearly always a basic handset. Without this column such an account has no
 * reachable channel at all and no second identifier to confirm at the window beyond its 9-digit
 * code.
 *
 * Unique only where present, so the counter-enrolled accounts that have no number coexist while a
 * real one is still claimed once.
 *
 * This does NOT make phone numbers searchable. DirectoryController deliberately resolves payees by
 * the shared code alone, refusing lookup by e-mail or phone so it cannot become an
 * account-existence oracle over the user base; that stays true. This column is for enrolment and
 * contact, never for directory resolution.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('phone').nullable().comment('Contact number, primarily for counter enrolment')
    })

    this.schema.raw(`
      CREATE UNIQUE INDEX users_phone_unique ON ${this.tableName} (phone) WHERE phone IS NOT NULL;
    `)
  }

  async down() {
    this.schema.raw(`DROP INDEX users_phone_unique;`)
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('phone')
    })
  }
}
