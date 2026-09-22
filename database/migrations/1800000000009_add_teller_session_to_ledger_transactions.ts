import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Which shift a counter transaction belongs to.
 *
 * A teller session reconciles the drawer against what passed through it, and that sum has to come
 * from the transactions themselves rather than from the float wallet — commission makes the float
 * move by less than the cash does on every cash-out (see 1800000000008). Booking each transaction
 * to its shift is what makes the sum exact, and it is also the only thing that lets a variance be
 * investigated transaction by transaction instead of merely observed.
 *
 * Attribution by timestamp window was the alternative and was rejected: a shift that stays open
 * across midnight, a clock correction, or a transaction confirmed minutes after it was initiated
 * would each silently move cash between shifts, which is precisely the ambiguity this table
 * exists to remove.
 *
 * Null for everything that did not happen at a counter — every transaction today, and every
 * mobile money, card or P2P movement for ever.
 */
export default class extends BaseSchema {
  protected tableName = 'ledger_transactions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('teller_session_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('teller_sessions')
        .comment('The counter shift this passed through; null when it did not happen at one')
      table.index(['teller_session_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('teller_session_id')
    })
  }
}
