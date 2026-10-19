import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Backs the two-step individual signup flow: step 1 (POST /auth/signup/request-otp) takes only
 * an email and sends a 6-digit code; step 2 (POST /auth/signup) requires that code before the
 * User row is created. Same shape and rules as business_signup_otps — see SignupOtp.
 *
 * No FK to users: the User doesn't exist yet at step 1. Only the code's SHA-256 hash is stored.
 */
export default class extends BaseSchema {
  protected tableName = 'user_signup_otps'

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
