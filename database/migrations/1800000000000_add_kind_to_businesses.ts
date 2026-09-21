import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What kind of institution a business row represents.
 *
 * A microfinance institution needs everything `businesses` already carries — approval
 * lifecycle, KYB, API keys, a dashboard login, a wallet, a plan, webhooks — so it is a
 * business, not a new entity. Giving it its own table would duplicate all of that and, worse,
 * force another round of widening on ledger_accounts.owner_type, wallets_single_owner,
 * ledger_transactions.initiated_by_type and audit_logs.actor_type (see
 * 1772500000003_widen_business_check_constraints.ts for the cost of doing that once already).
 *
 * `kind` only says what the institution IS. What it may SELL stays with the plan's feature map
 * (app/models/plan.ts), enforced by business_plan_middleware.ts — so an IMF is a business whose
 * plan grants `lending.credit`/`savings.accounts`, and nothing here gates anything by itself.
 *
 * 'bank' and 'insurer' are listed now because the CHECK constraint is the expensive part to
 * change later, not because either is supported yet.
 */
export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('kind', ['merchant', 'imf', 'bank', 'insurer'])
        .notNullable()
        .defaultTo('merchant')
        .comment('Institution type; every pre-existing business is a merchant')
      table.index(['kind'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('kind')
    })
  }
}
