import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'kyc_verifications'

  async up() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT kyc_verifications_subject_type_check`)
    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT kyc_verifications_subject_type_check CHECK (subject_type = ANY (ARRAY['user'::text, 'agent'::text, 'business'::text]))`
    )
  }

  async down() {
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT kyc_verifications_subject_type_check`)
    this.schema.raw(
      `ALTER TABLE ${this.tableName} ADD CONSTRAINT kyc_verifications_subject_type_check CHECK (subject_type = ANY (ARRAY['user'::text, 'agent'::text]))`
    )
  }
}
