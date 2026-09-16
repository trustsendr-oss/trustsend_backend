import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('price')
        .notNullable()
        .defaultTo(0)
        .comment(
          'One-time subscription fee charged when a business subscribes to this plan, in the smallest unit of currency_code'
        )
      table
        .bigInteger('maintenance_price')
        .notNullable()
        .defaultTo(0)
        .comment(
          'Recurring monthly fee to keep the plan active, in the smallest unit of currency_code — 0 means no recurring charge'
        )
      table
        .string('currency_code', 3)
        .notNullable()
        .defaultTo('USD')
        .comment(
          'Currency both price and maintenance_price are denominated in — charged against the business wallet in this currency'
        )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('price')
      table.dropColumn('maintenance_price')
      table.dropColumn('currency_code')
    })
  }
}
