import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'agent_documents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('agent_id').notNullable().unsigned().comment('FK to agents')
      table
        .enum('document_type', [
          'national_id',
          'business_registration',
          'tax_certificate',
          'bank_statement',
          'proof_of_address',
        ])
        .notNullable()
      table.string('file_ref').notNullable().comment('Reference to encrypted file storage')
      table.enum('status', ['pending', 'verified', 'rejected']).notNullable().defaultTo('pending')
      table.integer('reviewed_by').nullable().unsigned().comment('FK to internal_users (reviewer)')
      table.timestamp('reviewed_at').nullable().comment('When reviewed')
      table.string('rejection_reason').nullable().comment('If rejected, why?')
      table.timestamps()

      // Indexes
      table.index(['agent_id'])
      table.index(['status'])
      table.index(['document_type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
