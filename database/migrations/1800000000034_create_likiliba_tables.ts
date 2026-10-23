import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Likiliba: private rotating savings groups (see app/services/likiliba).
 *
 * The money never leaves the ledger. Each group owns one escrow wallet — the pot — backed by a
 * `likiliba_pot` ledger account; each member's caution sits in a `collateral` wallet in their own
 * name. Every movement is a LedgerService transaction, so balances shown in the app are the
 * ledger's, never a parallel count kept in these tables.
 *
 * - wallets.likiliba_id: a fourth kind of owner, for the pot. `wallets_single_owner` is widened to
 *   count it, so a wallet still has exactly one owner.
 * - ledger_accounts.owner_type gains `likiliba_pot`.
 * - fee_schedules.likiliba_payout: 1 % of the gross payout, kept by the platform. Contributions,
 *   cautions and penalties are free.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('likilibas', (table) => {
      table.increments('id')
      table.string('code', 16).notNullable().unique()
      table.string('name', 120).notNullable()
      table.text('description').nullable()
      table.string('currency_code', 3).notNullable()
      table.bigInteger('contribution_amount').notNullable()
      table.string('frequency', 16).notNullable()
      table.integer('size').notNullable()
      table.timestamp('starts_at').notNullable()
      table.integer('creator_user_id').unsigned().notNullable().references('id').inTable('users')
      table.boolean('caution_required').notNullable()
      table.integer('caution_multiplier').nullable()
      table.integer('grace_hours').notNullable()
      table.integer('escalation_days').notNullable()
      table.string('penalty_mode', 16).notNullable()
      table.bigInteger('penalty_fixed_amount').nullable()
      table.integer('penalty_daily_bps').nullable()
      table.integer('penalty_cap_bps').notNullable().defaultTo(0)
      table.string('ordering_mode', 16).notNullable()
      table.string('draw_seed_hash', 64).nullable()
      table.string('draw_seed', 64).nullable()
      table.integer('pot_wallet_id').unsigned().nullable().references('id').inTable('wallets')
      table.string('status', 16).notNullable()
      table.integer('current_rule_version_id').unsigned().nullable()
      table.integer('current_round_number').notNullable().defaultTo(0)
      table.timestamp('locked_at').nullable()
      table.timestamp('started_at').nullable()
      table.timestamp('completed_at').nullable()
      table.timestamp('cancelled_at').nullable()
      table.text('cancel_reason').nullable()
      table.timestamp('suspended_at').nullable()
      table.text('suspension_reason').nullable()
      table.timestamps(true, true)

      table.index(['creator_user_id'])
      table.index(['status'])
    })

    this.schema.raw(`
      ALTER TABLE likilibas
        ADD CONSTRAINT likilibas_currency_check CHECK (currency_code IN ('CDF', 'USD')),
        ADD CONSTRAINT likilibas_amount_check CHECK (contribution_amount > 0),
        ADD CONSTRAINT likilibas_frequency_check CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
        ADD CONSTRAINT likilibas_size_check CHECK (size BETWEEN 2 AND 30),
        ADD CONSTRAINT likilibas_caution_check CHECK (
          (caution_required AND caution_multiplier BETWEEN 1 AND 2)
          OR (NOT caution_required AND caution_multiplier IS NULL)
        ),
        ADD CONSTRAINT likilibas_penalty_mode_check CHECK (penalty_mode IN ('none', 'fixed', 'percent')),
        ADD CONSTRAINT likilibas_penalty_cap_check CHECK (penalty_cap_bps BETWEEN 0 AND 1000),
        ADD CONSTRAINT likilibas_ordering_check CHECK (ordering_mode IN ('draw', 'manual')),
        ADD CONSTRAINT likilibas_status_check CHECK (
          status IN ('recruiting', 'locked', 'active', 'suspended', 'completed', 'cancelled')
        );
    `)

    this.schema.createTable('likiliba_rule_versions', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table.integer('version').notNullable()
      table.jsonb('rules').notNullable()
      table.string('rules_hash', 64).notNullable()
      table.integer('created_by_user_id').unsigned().notNullable().references('id').inTable('users')
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['likiliba_id', 'version'])
    })

    this.schema.alterTable('likilibas', (table) => {
      table.foreign('current_rule_version_id').references('id').inTable('likiliba_rule_versions')
    })

    this.schema.createTable('likiliba_invitations', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table.integer('invited_by_user_id').unsigned().notNullable().references('id').inTable('users')
      table.string('channel', 16).notNullable()
      table.integer('invitee_user_id').unsigned().nullable().references('id').inTable('users')
      table.string('invitee_phone', 32).nullable()
      table.string('token_hash', 64).nullable().unique()
      table.string('status', 16).notNullable()
      table.timestamp('expires_at').notNullable()
      table.timestamp('responded_at').nullable()
      table.timestamp('decided_at').nullable()
      table.timestamps(true, true)

      table.index(['invitee_user_id', 'status'])
      table.index(['invitee_phone', 'status'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_invitations
        ADD CONSTRAINT likiliba_invitations_channel_check CHECK (channel IN ('account', 'phone', 'link')),
        ADD CONSTRAINT likiliba_invitations_status_check CHECK (
          status IN ('pending', 'accepted', 'declined', 'admitted', 'rejected', 'revoked', 'expired')
        );
      -- One live invitation per person and group; someone may still hold invitations to many groups.
      CREATE UNIQUE INDEX likiliba_invitations_live_per_user
        ON likiliba_invitations (likiliba_id, invitee_user_id)
        WHERE invitee_user_id IS NOT NULL AND status IN ('pending', 'accepted');
      CREATE UNIQUE INDEX likiliba_invitations_live_per_phone
        ON likiliba_invitations (likiliba_id, invitee_phone)
        WHERE invitee_phone IS NOT NULL AND status = 'pending';
    `)

    this.schema.createTable('likiliba_members', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
      table.string('role', 16).notNullable()
      table.integer('position').nullable()
      table.string('status', 16).notNullable()
      table
        .integer('invitation_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('likiliba_invitations')
      table.integer('wallet_id').unsigned().notNullable().references('id').inTable('wallets')
      table.integer('caution_wallet_id').unsigned().nullable().references('id').inTable('wallets')
      table
        .integer('accepted_rule_version_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('likiliba_rule_versions')
      table.timestamp('rules_accepted_at').nullable()
      table.boolean('auto_debit').notNullable().defaultTo(false)
      table.timestamp('mandate_granted_at').nullable()
      table.timestamp('mandate_revoked_at').nullable()
      table.timestamp('paid_out_at').nullable()
      table.timestamp('left_at').nullable()
      table.timestamps(true, true)

      table.unique(['likiliba_id', 'user_id'])
      table.unique(['likiliba_id', 'position'])
      table.index(['user_id'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_members
        ADD CONSTRAINT likiliba_members_role_check CHECK (role IN ('organiser', 'member')),
        ADD CONSTRAINT likiliba_members_status_check CHECK (
          status IN ('admitted', 'committed', 'active', 'completed', 'left', 'removed')
        );
    `)

    this.schema.createTable('likiliba_rounds', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table.integer('number').notNullable()
      table
        .integer('beneficiary_member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.timestamp('due_at').notNullable()
      table.timestamp('grace_ends_at').notNullable()
      table.string('status', 16).notNullable()
      table.timestamp('opened_at').nullable()
      table.timestamp('waiting_since').nullable()
      table.timestamp('escalated_at').nullable()
      table.bigInteger('gross_amount').nullable()
      table.bigInteger('commission_amount').nullable()
      table.bigInteger('withheld_amount').nullable()
      table.bigInteger('net_amount').nullable()
      table.string('payout_transaction_id', 32).nullable()
      table.timestamp('paid_out_at').nullable()
      table.timestamps(true, true)

      table.unique(['likiliba_id', 'number'])
      // Each member receives once per cycle.
      table.unique(['likiliba_id', 'beneficiary_member_id'])
      table.index(['status'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_rounds
        ADD CONSTRAINT likiliba_rounds_status_check CHECK (
          status IN ('scheduled', 'collecting', 'waiting_funds', 'escalated', 'paid_out', 'cancelled')
        );
    `)

    this.schema.createTable('likiliba_contributions', (table) => {
      table.increments('id')
      table.string('reference', 16).notNullable().unique()
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table
        .integer('round_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_rounds')
        .onDelete('CASCADE')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.bigInteger('amount').notNullable()
      table.string('status', 16).notNullable()
      table.string('ledger_transaction_id', 32).nullable()
      table.string('paid_via', 16).nullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('last_attempt_at').nullable()
      table.text('last_failure_reason').nullable()
      table.timestamp('next_attempt_at').nullable()
      table.timestamp('reminded_at').nullable()
      table.timestamp('due_notified_at').nullable()
      table.timestamp('late_notified_at').nullable()
      table.timestamp('confirmed_at').nullable()
      table.timestamp('covered_at').nullable()
      table.timestamps(true, true)

      table.unique(['round_id', 'member_id'])
      table.index(['status'])
      table.index(['member_id'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_contributions
        ADD CONSTRAINT likiliba_contributions_status_check CHECK (
          status IN ('pending', 'late', 'confirmed', 'covered', 'netted', 'cancelled')
        );
    `)

    this.schema.createTable('likiliba_penalties', (table) => {
      table.increments('id')
      table.string('reference', 16).notNullable().unique()
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table
        .integer('contribution_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_contributions')
      table
        .integer('member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table
        .integer('beneficiary_member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.integer('day_number').notNullable()
      table.bigInteger('amount').notNullable()
      table.string('basis', 16).notNullable()
      table.string('status', 16).notNullable()
      table.string('ledger_transaction_id', 32).nullable()
      table.timestamp('assessed_at').notNullable()
      table.timestamp('settled_at').nullable()
      table.integer('waived_by_internal_user_id').unsigned().nullable()
      table.text('waive_reason').nullable()
      table.timestamps(true, true)

      // A job run twice charges a day once.
      table.unique(['contribution_id', 'day_number'])
      table.index(['member_id'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_penalties
        ADD CONSTRAINT likiliba_penalties_amount_check CHECK (amount > 0),
        ADD CONSTRAINT likiliba_penalties_basis_check CHECK (basis IN ('fixed', 'percent')),
        ADD CONSTRAINT likiliba_penalties_status_check CHECK (
          status IN ('paid', 'in_debt', 'waived')
        );
    `)

    this.schema.createTable('likiliba_debts', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table
        .integer('debtor_member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table
        .integer('creditor_member_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likiliba_members')
      table.string('origin', 16).notNullable()
      table
        .integer('contribution_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('likiliba_contributions')
      table
        .integer('penalty_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('likiliba_penalties')
      table.bigInteger('amount').notNullable()
      table.bigInteger('remaining').notNullable()
      table.string('status', 16).notNullable()
      table.timestamp('settled_at').nullable()
      table.timestamps(true, true)

      table.index(['debtor_member_id', 'status'])
    })

    this.schema.raw(`
      ALTER TABLE likiliba_debts
        ADD CONSTRAINT likiliba_debts_origin_check CHECK (origin IN ('caution_cover', 'penalty')),
        ADD CONSTRAINT likiliba_debts_amounts_check CHECK (remaining >= 0 AND remaining <= amount AND amount > 0),
        ADD CONSTRAINT likiliba_debts_status_check CHECK (status IN ('open', 'settled', 'written_off'));
    `)

    this.schema.createTable('likiliba_events', (table) => {
      table.increments('id')
      table
        .integer('likiliba_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('likilibas')
        .onDelete('CASCADE')
      table.integer('member_id').unsigned().nullable().references('id').inTable('likiliba_members')
      table.string('actor_type', 16).notNullable()
      table.integer('actor_id').notNullable()
      table.string('event_type', 64).notNullable()
      table.jsonb('payload').nullable()
      table.string('correlation_id', 64).nullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['likiliba_id', 'created_at'])
    })

    // The pot: a wallet owned by the group itself.
    this.schema.alterTable('wallets', (table) => {
      table.integer('likiliba_id').unsigned().nullable().references('id').inTable('likilibas')
      table.index(['likiliba_id'])
    })

    this.schema.raw(`
      ALTER TABLE wallets DROP CONSTRAINT wallets_single_owner;
      ALTER TABLE wallets ADD CONSTRAINT wallets_single_owner CHECK (
        (user_id IS NOT NULL)::int + (agent_id IS NOT NULL)::int
          + (business_id IS NOT NULL)::int + (likiliba_id IS NOT NULL)::int = 1
      );
      ALTER TABLE ledger_accounts DROP CONSTRAINT ledger_accounts_owner_type_check;
      ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_owner_type_check CHECK (
        owner_type = ANY (ARRAY['user_wallet', 'agent_wallet', 'business_wallet', 'platform_internal', 'likiliba_pot']::text[])
      );
    `)

    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('fee_schedules')
        .insert({
          operation_type: 'likiliba_payout',
          fee_percent: 1.0,
          created_at: now,
          updated_at: now,
        })
        .onConflict('operation_type')
        .ignore()
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.from('fee_schedules').where('operation_type', 'likiliba_payout').delete()
    })

    this.schema.raw(`
      ALTER TABLE ledger_accounts DROP CONSTRAINT ledger_accounts_owner_type_check;
      ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_owner_type_check CHECK (
        owner_type = ANY (ARRAY['user_wallet', 'agent_wallet', 'business_wallet', 'platform_internal']::text[])
      );
      ALTER TABLE wallets DROP CONSTRAINT wallets_single_owner;
      ALTER TABLE wallets ADD CONSTRAINT wallets_single_owner CHECK (
        (user_id IS NOT NULL)::int + (agent_id IS NOT NULL)::int + (business_id IS NOT NULL)::int = 1
      );
    `)

    this.schema.alterTable('wallets', (table) => {
      table.dropColumn('likiliba_id')
    })

    this.schema.dropTable('likiliba_events')
    this.schema.dropTable('likiliba_debts')
    this.schema.dropTable('likiliba_penalties')
    this.schema.dropTable('likiliba_contributions')
    this.schema.dropTable('likiliba_rounds')
    this.schema.dropTable('likiliba_members')
    this.schema.dropTable('likiliba_invitations')
    this.schema.alterTable('likilibas', (table) => {
      table.dropForeign(['current_rule_version_id'])
    })
    this.schema.dropTable('likiliba_rule_versions')
    this.schema.dropTable('likilibas')
  }
}
