import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lets a user exist without an e-mail address or a password.
 *
 * The clientele an IMF actually serves is enrolled at the counter: no smartphone, often no e-mail,
 * and nothing to type a password into. Requiring either would mean inventing credentials on their
 * behalf — a fake address that bounces, a password nobody holds — so instead the account is
 * identified by its 9-digit `code` and authorised by its PIN, and it is operable at the counter
 * only. The day such a holder gets a phone, they claim the same account and their history is
 * already there.
 *
 * `users_email_unique` stays: Postgres treats NULLs as distinct in a unique index, so any number
 * of counter-enrolled accounts coexist while a real address is still claimed once.
 *
 * Dropping NOT NULL from `password` is the part that needs care. The auth mixin's verifyPassword()
 * throws a RuntimeException — a 500 — when the column is null, which would both break the error
 * contract of the login route and confirm to a caller that the account exists. User.verifyPassword
 * is overridden to fail closed as invalid credentials instead; see the model.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN email DROP NOT NULL;`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN password DROP NOT NULL;`)
  }

  async down() {
    // Rows created without credentials cannot be given any, so this reverts only if none exist.
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN email SET NOT NULL;`)
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN password SET NOT NULL;`)
  }
}
