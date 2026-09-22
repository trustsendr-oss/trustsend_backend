import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Loans made by a partner institution, and what each borrower owes it and when.
 *
 * ## The institution lends, TumaPlus does not
 *
 * The principal comes out of the institution's own wallet and the repayments go back into it.
 * TumaPlus is the rail and the record, never the lender of record: being the latter would make it
 * a credit institution before the regulator, with the capital and provisioning that implies, for
 * a business it does not have.
 *
 * ## The loan book is not the ledger
 *
 * `principal_outstanding` and the schedule below are domain state; the ledger holds the cash
 * movements that changed them. Trying to express an amortisation table in double-entry postings on
 * a payment rail is the classic mistake here — it makes reconciliation impossible and buys
 * nothing, because what the borrower owes is a contract, not a balance anybody can spend.
 *
 * ## The terms are frozen at disbursement
 *
 * Rate, method and term are copied onto the loan, exactly as savings copy theirs. Repricing a
 * product must never reach a borrower who already signed, and the schedule has to stay
 * recomputable years later from the loan alone.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('loans', (table) => {
      table.increments('id').notNullable()
      table
        .integer('product_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('financial_products')
      table
        .integer('provider_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .comment('The lender. Denormalised so an institution can list its book without a join')
      table.integer('user_id').notNullable().unsigned().references('id').inTable('users')
      table
        .integer('decided_by_staff_id')
        .nullable()
        .unsigned()
        .references('id')
        .inTable('business_staff')
        .comment('The credit officer who approved or refused — a decision belongs to someone')

      table.string('currency_code', 3).notNullable()
      table.bigInteger('principal').notNullable().comment('Amount applied for, then lent')
      table
        .bigInteger('principal_outstanding')
        .notNullable()
        .defaultTo(0)
        .comment('Domain state, not a ledger balance — see the class comment')
      table.bigInteger('interest_outstanding').notNullable().defaultTo(0)
      table
        .bigInteger('fees_charged')
        .notNullable()
        .defaultTo(0)
        .comment('Arrangement fees taken at disbursement, for the record')

      // Terms copied at approval; repricing the product must not reach an existing borrower.
      table.integer('interest_rate_bps').notNullable()
      table.enum('interest_period', ['month', 'year']).notNullable()
      table.enum('interest_method', ['flat', 'declining']).notNullable()
      table.integer('term_months').notNullable()

      table
        .enum('status', [
          'requested',
          'approved',
          'rejected',
          'disbursed',
          'repaying',
          'repaid',
          'defaulted',
          'cancelled',
        ])
        .notNullable()
        .defaultTo('requested')

      table.timestamp('requested_at').notNullable()
      table.timestamp('decided_at').nullable()
      table.text('decision_notes').nullable().comment('Why it was refused, shown to the borrower')
      table.timestamp('disbursed_at').nullable()
      table.timestamp('closed_at').nullable()
      table
        .string('disbursement_transaction_id')
        .nullable()
        .comment('The ledger transaction that put the money in the borrower wallet')

      table.timestamps()

      table.index(['user_id'])
      table.index(['provider_id'])
      table.index(['status'])
    })

    this.schema.createTable('loan_schedules', (table) => {
      table.increments('id').notNullable()
      table
        .integer('loan_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('loans')
        .onDelete('CASCADE')
      table.integer('installment').notNullable().comment('1-based, in the order they fall due')
      table.timestamp('due_at').notNullable()
      table.bigInteger('principal').notNullable()
      table.bigInteger('interest').notNullable()
      table
        .bigInteger('paid')
        .notNullable()
        .defaultTo(0)
        .comment('Applied to this line so far; a line may be settled over several payments')
      table.timestamp('settled_at').nullable()
      table.timestamps()

      table.unique(['loan_id', 'installment'])
      table.index(['due_at'])
    })

    this.schema.createTable('loan_repayments', (table) => {
      table.increments('id').notNullable()
      table
        .integer('loan_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('loans')
        .onDelete('CASCADE')
      table.bigInteger('amount').notNullable()
      table
        .bigInteger('applied_to_interest')
        .notNullable()
        .comment('Interest first, then principal — the split is recorded, never re-derived')
      table.bigInteger('applied_to_principal').notNullable()
      table
        .string('ledger_transaction_id')
        .notNullable()
        .comment('The cash movement behind it, so the book reconciles to the ledger')
      table.timestamp('paid_at').notNullable()
      table.timestamps()

      table.index(['loan_id'])
    })
  }

  async down() {
    this.schema.dropTable('loan_repayments')
    this.schema.dropTable('loan_schedules')
    this.schema.dropTable('loans')
  }
}
