import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A teller's shift at a counter: opened with a declared float, closed with a physical count, and
 * signed off by someone else.
 *
 * This is the control a microfinance director actually pays for. `agents` already models the
 * counter and its float, and `business_staff` models the people, but neither answers "who was at
 * that window yesterday, and does the cash in the drawer match what passed through it". Without
 * that question being answerable, a cash discrepancy can be seen but never attributed.
 *
 * ## Why the expected cash is not derived from the float
 *
 * The float wallet is the ledger's view of the counter, and it is tempting to treat
 * `opening_float - closing_float` as the drawer's movement. That is wrong wherever commission
 * applies: on a cash-out, CashOutService debits the customer the gross, hands them the gross in
 * notes, and credits the agent's float only the NET, the commission going to platform fees. The
 * float therefore moves by less than the drawer does, and a session reconciled against it would
 * report a shortfall equal to the commission on every single shift.
 *
 * Expected cash is instead summed from the gross amount of the transactions booked to the session
 * — ledger_transactions.amount, which is the sum that physically crossed the counter for both
 * cash-in and cash-out. That is also what makes a variance investigable: the transactions of a
 * shift can be listed, which a balance difference alone could never give.
 *
 * ## Why balances are a separate table
 *
 * A counter in the DRC takes USD and CDF at the same window (see 1800000000002, which removed the
 * one-float-per-agent constraint). One shift therefore has to count several currencies, and each
 * is reconciled on its own — a surplus in one never offsets a shortfall in another.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('teller_sessions', (table) => {
      table.increments('id').notNullable()
      table
        .integer('business_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .comment('Denormalised from the counter so tenant-scoped queries need no join')
      table
        .integer('agent_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('agents')
        .comment('The counter whose drawer this shift covers')
      table
        .integer('staff_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
        .comment('Who stood at it — the whole point of the table')
      table
        .enum('status', ['open', 'closed', 'reconciled'])
        .notNullable()
        .defaultTo('open')
        .comment('open: taking cash. closed: counted, awaiting sign-off. reconciled: signed off')
      table.timestamp('opened_at').notNullable()
      table.timestamp('closed_at').nullable()
      table.timestamp('reconciled_at').nullable()
      table
        .integer('reconciled_by')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
        .comment('A second person: a teller signing off their own variance is not a control')
      table.text('notes').nullable().comment('Why a variance happened, in the closer own words')
      table.timestamps()

      table.index(['business_id'])
      table.index(['agent_id'])
      table.index(['staff_id'])
      table.index(['status'])
    })

    // A drawer is one drawer: a counter cannot have two shifts taking cash at once, or neither
    // count could be attributed. Partial, so closed shifts accumulate freely.
    this.schema.raw(`
      CREATE UNIQUE INDEX teller_sessions_one_open_per_counter
      ON teller_sessions (agent_id) WHERE status = 'open';
    `)

    this.schema.createTable('teller_session_balances', (table) => {
      table.increments('id').notNullable()
      table
        .integer('teller_session_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('teller_sessions')
        .onDelete('CASCADE')
      table.string('currency_code', 3).notNullable()
      table
        .bigInteger('opening_cash')
        .notNullable()
        .comment('Notes in the drawer at open, as declared by the teller')
      table
        .bigInteger('counted_cash')
        .nullable()
        .comment('Notes counted at close; null while the shift is open')
      table
        .bigInteger('expected_cash')
        .nullable()
        .comment('Frozen at close: opening plus the gross of every cash movement of the shift')
      table
        .bigInteger('variance')
        .nullable()
        .comment('counted - expected. Negative is a shortfall, positive a surplus')
      table.timestamps()

      table.unique(['teller_session_id', 'currency_code'])
    })
  }

  async down() {
    this.schema.dropTable('teller_session_balances')
    this.schema.raw(`DROP INDEX IF EXISTS teller_sessions_one_open_per_counter;`)
    this.schema.dropTable('teller_sessions')
  }
}
