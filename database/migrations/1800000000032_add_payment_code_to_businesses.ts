import { randomInt } from 'node:crypto'
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Merchant payments: a customer pays a business from the app by typing its payment code or
 * scanning its QR (see MerchantPaymentService).
 *
 * - businesses.payment_code: six digits, distinct from the nine-digit codes customers share, so
 *   "pay a shop" and "send to a person" can never be mistaken for one another. Unique. Existing
 *   merchants get one here; new ones at creation (BusinessOnboardingService).
 * - fee_schedules.merchant_payment: 1 %, paid by the merchant out of each payment. Free for the
 *   customer.
 */
export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('payment_code', 6).nullable().unique()
    })

    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('fee_schedules')
        .insert({
          operation_type: 'merchant_payment',
          fee_percent: 1.0,
          created_at: now,
          updated_at: now,
        })
        .onConflict('operation_type')
        .ignore()

      const merchants = await db
        .from(this.tableName)
        .where('kind', 'merchant')
        .whereNull('payment_code')
        .select('id')
      const existing = await db
        .from(this.tableName)
        .whereNotNull('payment_code')
        .select('payment_code')
      const taken = new Set(existing.map((row: { payment_code: string }) => row.payment_code))
      for (const merchant of merchants) {
        let code: string
        do {
          code = randomInt(100000, 1000000).toString()
        } while (taken.has(code))
        taken.add(code)
        await db.from(this.tableName).where('id', merchant.id).update({ payment_code: code })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('payment_code')
    })
    this.defer(async (db) => {
      await db.from('fee_schedules').where('operation_type', 'merchant_payment').delete()
    })
  }
}
