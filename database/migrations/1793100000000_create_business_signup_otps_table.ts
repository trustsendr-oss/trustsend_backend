import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backs the two-step business signup flow: step 1 (POST /business/auth/signup/request-otp)
 * takes only an email and sends a 6-digit code; step 2 (POST /business/auth/signup) requires
 * that code alongside the rest of the signup payload before the Business row is ever created.
 *
 * No FK to businesses — this table exists precisely because the Business doesn't exist yet at
 * step 1. Only the OTP's SHA-256 hash is stored (never the raw code): unlike the 256-bit PIN
 * reset token, a 6-digit OTP has very little entropy on its own, so brute-force resistance comes
 * from `attempts` (locked after too many wrong guesses) and a short `expires_at`, not from the
 * hash — see BusinessSignupOtpService.
 */
export default class extends BaseSchema {
  protected tableName = 'business_signup_otps'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('email', 254).notNullable()
      table.string('otp_hash', 64).notNullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('expires_at').notNullable()
      table
        .timestamp('consumed_at')
        .nullable()
        .comment('Set once successfully verified — single-use')
      table.timestamps()

      table.index(['email'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
