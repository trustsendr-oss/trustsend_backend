import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'businesses'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .timestamp('plan_subscribed_at')
        .nullable()
        .comment('When the business last paid the one-time fee for its current plan')
      table
        .timestamp('plan_next_maintenance_billing_at')
        .nullable()
        .comment(
          "Next time PlanService.chargeDueMaintenanceFees() should attempt this business's recurring plan fee — null if the plan has no maintenance_price"
        )
      table
        .enum('plan_payment_status', ['current', 'past_due'])
        .notNullable()
        .defaultTo('current')
        .comment('past_due when the last maintenance fee attempt failed for insufficient balance')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('plan_subscribed_at')
      table.dropColumn('plan_next_maintenance_billing_at')
      table.dropColumn('plan_payment_status')
    })
  }
}
