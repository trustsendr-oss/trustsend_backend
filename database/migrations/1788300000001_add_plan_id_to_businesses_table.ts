import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('plan_id')
        .nullable()
        .unsigned()
        .comment('FK to plans — gates which business APIs this business may call')
    })

    // Backfill every existing business onto the 'default' plan (seeded in the previous
    // migration) so nothing loses access the moment middleware.businessPlan() starts checking
    // this column — see PlanService.hasFeature for how a null plan_id is treated in the meantime.
    this.defer(async (db) => {
      const defaultPlan = await db.from('plans').where('code', 'default').first()
      if (defaultPlan) {
        await db.from(this.tableName).whereNull('plan_id').update({ plan_id: defaultPlan.id })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('plan_id')
    })
  }
}
