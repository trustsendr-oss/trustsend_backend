import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crypto withdrawals cost 2 % of the amount withdrawn, on top of the per-network flat fee
 * (CRYPTO_PAYOUT_NETWORK_FEES, 0 by default). Read at request time by FeeScheduleService.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const row = await db.from('fee_schedules').where('operation_type', 'crypto_payout').first()
      if (row) {
        await db
          .from('fee_schedules')
          .where('operation_type', 'crypto_payout')
          .update({ fee_percent: 2, updated_at: new Date() })
      } else {
        await db.table('fee_schedules').insert({
          operation_type: 'crypto_payout',
          fee_percent: 2,
          created_at: new Date(),
          updated_at: new Date(),
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('fee_schedules')
        .where('operation_type', 'crypto_payout')
        .update({ fee_percent: 0, updated_at: new Date() })
    })
  }
}
