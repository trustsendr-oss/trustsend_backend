import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .enum('actor_type', ['user', 'agent', 'internal_user', 'system'])
        .notNullable()
        .comment('Who performed the action')
      table.integer('actor_id').notNullable().comment('ID of the actor')
      table
        .string('action', 255)
        .notNullable()
        .comment('Namespaced action: agent.status.suspended, admin.customer_profile.viewed, etc.')
      table.string('resource_type', 100).notNullable().comment('Type of resource affected (agent, wallet, user)')
      table.integer('resource_id').notNullable().comment('ID of the resource')
      table.jsonb('before').nullable().comment('State before the action (if applicable)')
      table.jsonb('after').nullable().comment('State after the action (if applicable)')
      table.string('ip_address', 45).nullable().comment('IP address of the request')
      table.text('user_agent').nullable().comment('User agent of the request')
      table.string('device_id', 100).nullable().comment('Device fingerprint if available')
      table.string('correlation_id').notNullable().comment('Correlation ID for tracing')

      table.timestamp('created_at').notNullable()

      // Trigger
      this.schema.raw(`
        CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
          IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Audit logs are immutable and cannot be updated or deleted';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER audit_logs_immutable
        BEFORE UPDATE OR DELETE ON ${this.tableName}
        FOR EACH ROW
        EXECUTE FUNCTION prevent_audit_logs_mutation();
      `)

      // Indexes
      table.index(['actor_type', 'actor_id'])
      table.index(['resource_type', 'resource_id'])
      table.index(['action'])
      table.index(['created_at'])
      table.index(['correlation_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
