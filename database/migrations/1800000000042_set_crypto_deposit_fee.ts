import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Crypto deposits cost 1 % of the amount received, taken when the deposit is credited (the
 * user's wallet gets the rest). Read at credit time by FeeScheduleService.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const row = await db.from('fee_schedules').where('operation_type', 'crypto_deposit').first()
      if (row) {
        await db
          .from('fee_schedules')
          .where('operation_type', 'crypto_deposit')
          .update({ fee_percent: 1, updated_at: new Date() })
      } else {
        await db.table('fee_schedules').insert({
          operation_type: 'crypto_deposit',
          fee_percent: 1,
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
        .where('operation_type', 'crypto_deposit')
        .update({ fee_percent: 0, updated_at: new Date() })
    })
  }
}
