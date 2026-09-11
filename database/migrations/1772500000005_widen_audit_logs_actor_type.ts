import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_type_check
      CHECK (actor_type = ANY (ARRAY['user', 'agent', 'internal_user', 'system', 'business']::text[]));
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_actor_type_check;
    `)
    this.schema.raw(`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_type_check
      CHECK (actor_type = ANY (ARRAY['user', 'agent', 'internal_user', 'system']::text[]));
    `)
  }
}
