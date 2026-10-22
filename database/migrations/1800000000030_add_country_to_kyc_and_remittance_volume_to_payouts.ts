import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * - kyc_verifications.country_code: the holder's country of residence (ISO 3166-1 alpha-2), given
 *   when they submit their identity verification and checked by the reviewer against the
 *   documents. An international transfer takes the sender's country from here, never from the
 *   request, so the DRC-only payout corridor cannot be entered by simply claiming to be abroad.
 * - agent_commission_payouts.remittance_*: cash payouts of international transfers now count in
 *   the agent's daily payout instead of a commission paid at the counter.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('kyc_verifications', (table) => {
      table.string('country_code', 2).nullable()
    })
    this.schema.alterTable('agent_commission_payouts', (table) => {
      table
        .bigInteger('remittance_volume')
        .notNullable()
        .defaultTo(0)
        .comment('International transfers paid out in cash, minor units')
      table.decimal('remittance_rate_percent', 6, 3).notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable('agent_commission_payouts', (table) => {
      table.dropColumn('remittance_volume')
      table.dropColumn('remittance_rate_percent')
    })
    this.schema.alterTable('kyc_verifications', (table) => {
      table.dropColumn('country_code')
    })
  }
}
