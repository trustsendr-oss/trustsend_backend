import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Richer agent profile (business/outlet identity + physical location, beyond the personal
 * full_name and the coarse `region` string already on the table) and per-agent operational
 * limits, mirroring wallets.daily_limit/monthly_limit/per_transaction_limit (see
 * ledger/limit_service.ts) — nullable so an agent with no limit set is uncapped, same convention.
 * Identity/KYC documents themselves stay in kyc_verifications/kyc_documents (subject_type=
 * 'agent') — these columns are operational profile data, not verification records.
 */
export default class extends BaseSchema {
  protected tableName = 'agents'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('business_name').nullable().comment('Shop/outlet name, if different from full_name')
      table.string('address').nullable().comment('Physical street address of the agent outlet')
      table.string('city', 100).nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()

      table.bigInteger('daily_limit').nullable().comment('Max cash volume this agent may process per day, smallest currency unit — null means uncapped')
      table.bigInteger('monthly_limit').nullable().comment('Max cash volume this agent may process per month, smallest currency unit — null means uncapped')
      table.bigInteger('per_transaction_limit').nullable().comment('Max cash volume for a single cash-in/cash-out, smallest currency unit — null means uncapped')

      table.index(['city'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('business_name')
      table.dropColumn('address')
      table.dropColumn('city')
      table.dropColumn('latitude')
      table.dropColumn('longitude')
      table.dropColumn('daily_limit')
      table.dropColumn('monthly_limit')
      table.dropColumn('per_transaction_limit')
    })
  }
}
