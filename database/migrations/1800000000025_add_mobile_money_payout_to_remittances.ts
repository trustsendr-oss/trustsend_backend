import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Remittances paid out to a DRC mobile money wallet (M-Pesa, Airtel Money, Orange Money) through
 * PawaPay, next to cash pickup and Reemite wallet credit.
 *
 * A mobile money payout is asynchronous: PawaPay accepts it, then confirms by webhook. Two new
 * statuses follow it — `processing` (accepted, money on its way) and `failed` (the operator
 * refused; the sender is refunded) — and the PawaPay reference is stored so the webhook and the
 * reconciliation sweep can find the transfer.
 *
 * The quote now remembers the payout method and operator: a mobile money amount is rounded to
 * what the operator accepts, so a quote for one operator cannot be spent on another.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE remittances DROP CONSTRAINT remittances_payout_method_check')
    this.schema.raw(
      `ALTER TABLE remittances ADD CONSTRAINT remittances_payout_method_check
         CHECK (payout_method IN ('cash_pickup', 'wallet', 'mobile_money'))`
    )
    this.schema.raw('ALTER TABLE remittances DROP CONSTRAINT remittances_status_check')
    this.schema.raw(
      `ALTER TABLE remittances ADD CONSTRAINT remittances_status_check
         CHECK (status IN ('held', 'awaiting_payout', 'processing', 'paid', 'cancelled',
                           'expired', 'rejected', 'failed'))`
    )

    this.schema.alterTable('remittances', (table) => {
      table
        .string('payout_provider_code', 60)
        .nullable()
        .comment('PawaPay operator, e.g. VODACOM_MPESA_COD')
      table
        .string('payout_provider_reference', 64)
        .nullable()
        .unique()
        .comment('Our PawaPay payoutId')
      table.string('payout_provider_transaction_id').nullable()
      table.timestamp('dispatched_at').nullable().comment('When the payout was sent to PawaPay')
    })

    this.schema.alterTable('remittance_quotes', (table) => {
      table.string('payout_method', 20).nullable()
      table.string('payout_provider_code', 60).nullable()
    })
  }

  async down() {
    this.schema.alterTable('remittance_quotes', (table) => {
      table.dropColumn('payout_provider_code')
      table.dropColumn('payout_method')
    })
    this.schema.alterTable('remittances', (table) => {
      table.dropColumn('dispatched_at')
      table.dropColumn('payout_provider_transaction_id')
      table.dropColumn('payout_provider_reference')
      table.dropColumn('payout_provider_code')
    })
    this.schema.raw('ALTER TABLE remittances DROP CONSTRAINT remittances_status_check')
    this.schema.raw(
      `ALTER TABLE remittances ADD CONSTRAINT remittances_status_check
         CHECK (status IN ('held', 'awaiting_payout', 'paid', 'cancelled', 'expired', 'rejected'))`
    )
    this.schema.raw('ALTER TABLE remittances DROP CONSTRAINT remittances_payout_method_check')
    this.schema.raw(
      `ALTER TABLE remittances ADD CONSTRAINT remittances_payout_method_check
         CHECK (payout_method IN ('cash_pickup', 'wallet'))`
    )
  }
}
