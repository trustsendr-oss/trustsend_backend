import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * How much of a payment went on late charges.
 *
 * Recorded beside the interest and principal split rather than folded into either, so a borrower
 * disputing a balance can be shown exactly where each payment went — including the part that
 * bought them nothing because they were late.
 *
 * Defaults to zero, which is what every repayment taken before penalties existed genuinely was.
 */
export default class extends BaseSchema {
  protected tableName = 'loan_repayments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .bigInteger('applied_to_penalties')
        .notNullable()
        .defaultTo(0)
        .comment('Cleared before interest and principal — an unpaid penalty keeps growing')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('applied_to_penalties')
    })
  }
}
