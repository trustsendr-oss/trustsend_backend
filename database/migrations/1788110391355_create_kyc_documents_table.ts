import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Splits KYC evidence out of kyc_verifications into its own table — a real identity check is
 * never one anonymous blob called "document", it's a specific set of pieces (ID front, ID
 * back, selfie, proof of address, business registration certificate...), and a single
 * verification case can require several of them at once (e.g. ID front + ID back + selfie).
 * See app/services/security/kyc_requirements.ts for which combinations satisfy which
 * verification_type.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('kyc_documents', (table) => {
      table.increments('id').notNullable()
      table
        .string('kyc_verification_id')
        .notNullable()
        .references('id')
        .inTable('kyc_verifications')
        .onDelete('CASCADE')
      table
        .enum('document_type', [
          'id_card_front',
          'id_card_back',
          'passport',
          'driver_license_front',
          'driver_license_back',
          'selfie',
          'proof_of_address',
          'business_registration_certificate',
          'tax_identification_certificate',
          'representative_id_front',
          'representative_id_back',
          'other',
        ])
        .notNullable()
        .comment('What this specific file is, not what kind of check it supports')
      table
        .string('raw_payload_ref')
        .notNullable()
        .comment('Opaque ref into KycDocumentStorageService (encrypted at rest)')
      table.timestamp('created_at').notNullable()

      table.unique(['kyc_verification_id', 'document_type'])
      table.index(['kyc_verification_id'])
    })

    this.schema.alterTable('kyc_verifications', (table) => {
      table.dropColumn('raw_payload_ref')
    })
  }

  async down() {
    this.schema.alterTable('kyc_verifications', (table) => {
      table.string('raw_payload_ref').nullable()
    })
    this.schema.dropTable('kyc_documents')
  }
}
