import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Late penalties: what a product charges for a missed instalment, and what each loan has run up.
 *
 * ## Why the basis is a column
 *
 * "2% penalty" means nothing on its own. Charged on the overdue instalment it is a few units;
 * charged on the whole outstanding principal of a twelve-month loan it can exceed the instalment
 * itself. Both are in use, so the product says which, exactly as it already says whether its
 * interest is flat or declining — storing a rate whose basis is implied is how a book ends up
 * mispriced without anyone writing a wrong number.
 *
 * ## Why a grace period exists at all
 *
 * A borrower who pays two days late has not defaulted on anything, and a system that fines them
 * teaches them the fine is unavoidable. The default is zero, so nothing changes for products that
 * do not set one.
 *
 * ## Why penalties are tracked apart from interest
 *
 * A borrower is entitled to see what they owe because they borrowed and what they owe because they
 * were late; merging the two into `interest_outstanding` would make that permanently
 * unanswerable, and would also quietly inflate every interest figure a supervisor reads.
 *
 * `loan_penalties` is keyed on (loan, period) for the same reason interest_accruals is: the job
 * runs unattended, and charging everyone twice because a cron fired twice is an incident, not a
 * rounding error.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('financial_products', (table) => {
      table
        .integer('penalty_rate_bps')
        .nullable()
        .comment('Basis points charged per period on a late loan; null means no penalty at all')
      table
        .enum('penalty_basis', ['overdue_amount', 'outstanding_principal'])
        .nullable()
        .comment('What the rate applies to — the two differ by an order of magnitude')
      table
        .integer('penalty_grace_days')
        .notNullable()
        .defaultTo(0)
        .comment('Days late before anything is charged; zero keeps existing products unchanged')
    })

    // A rate without a basis is unusable, and a basis without a rate is noise.
    this.schema.raw(`
      ALTER TABLE financial_products ADD CONSTRAINT financial_products_penalty_pair
      CHECK ((penalty_rate_bps IS NULL AND penalty_basis IS NULL)
          OR (penalty_rate_bps IS NOT NULL AND penalty_basis IS NOT NULL));
    `)

    this.schema.alterTable('loans', (table) => {
      table
        .bigInteger('penalties_outstanding')
        .notNullable()
        .defaultTo(0)
        .comment('Kept apart from interest so a borrower can see why they owe what they owe')
      // Copied at disbursement, like every other term: changing a product must not reach a
      // borrower who already signed.
      table.integer('penalty_rate_bps').nullable()
      table.enum('penalty_basis', ['overdue_amount', 'outstanding_principal']).nullable()
      table.integer('penalty_grace_days').notNullable().defaultTo(0)
    })

    this.schema.createTable('loan_penalties', (table) => {
      table.increments('id').notNullable()
      table
        .integer('loan_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('loans')
        .onDelete('CASCADE')
      table
        .string('period_key', 7)
        .notNullable()
        .comment('The period charged for, e.g. "2026-09" — not when the job ran')
      table
        .bigInteger('basis_amount')
        .notNullable()
        .comment('What the rate was applied to, so the charge can be explained later')
      table.integer('rate_bps').notNullable()
      table.integer('days_overdue').notNullable()
      table.bigInteger('amount').notNullable()
      table.timestamp('charged_at').notNullable()
      table.timestamps()

      table.unique(['loan_id', 'period_key'])
      table.index(['period_key'])
    })
  }

  async down() {
    this.schema.dropTable('loan_penalties')
    this.schema.alterTable('loans', (table) => {
      table.dropColumn('penalties_outstanding')
      table.dropColumn('penalty_rate_bps')
      table.dropColumn('penalty_basis')
      table.dropColumn('penalty_grace_days')
    })
    this.schema.raw(
      `ALTER TABLE financial_products DROP CONSTRAINT financial_products_penalty_pair;`
    )
    this.schema.alterTable('financial_products', (table) => {
      table.dropColumn('penalty_rate_bps')
      table.dropColumn('penalty_basis')
      table.dropColumn('penalty_grace_days')
    })
  }
}
