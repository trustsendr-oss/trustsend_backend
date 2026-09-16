import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kyc_verifications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .enum('subject_type', ['user', 'agent'])
        .notNullable()
        .comment('What entity is being verified')
      table.integer('subject_id').notNullable().comment('ID of the user/agent')
      table
        .string('provider')
        .nullable()
        .comment('KYC provider name (Smile Identity, Sumsub, ComplyAdvantage, etc.)')
      table.string('provider_reference').nullable().comment('Reference from the provider')
      table
        .enum('verification_type', ['identity', 'address', 'liveness', 'document', 'pep_screening'])
        .notNullable()
        .comment('Type of verification')
      table
        .enum('status', ['not_started', 'pending', 'in_review', 'approved', 'rejected', 'expired'])
        .notNullable()
        .defaultTo('not_started')
      table.string('decision_reason').nullable().comment('Reason for approval/rejection')
      table.string('raw_payload_ref').nullable().comment('Reference to encrypted document/payload')

      table.timestamp('submitted_at').nullable()
      table.timestamp('decided_at').nullable()
      table.timestamp('expires_at').nullable()
      table.timestamps()

      // Indexes
      table.index(['subject_type', 'subject_id'])
      table.index(['status'])
      table.index(['expires_at'])
      table.index(['provider'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
