import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What a partner institution sells: a savings account, a term deposit, a loan.
 *
 * Priced data rather than configuration, the same reasoning `card_products` states for itself —
 * institutions price their own offers, and repricing must not require a deployment. Named for the
 * domain rather than for microfinance so a bank or a cooperative uses the same table, exactly as
 * `businesses.kind` covers them rather than a table apiece.
 *
 * Nothing here moves money. This is the catalogue; accounts and loans opened against a product
 * come later, and will reference the product they were sold under rather than read it live — a
 * repriced or archived product must never retroactively change what an existing holder agreed to,
 * which is the lesson 1793800000001 already records for cards.
 *
 * ## Rates are basis points, not decimals
 *
 * `agents.commission_rate` and `fee_schedules.fee_percent` are decimals, but those apply once to a
 * single amount. An interest rate is applied repeatedly across an amortisation schedule, where
 * fractional cents compound: integer basis points keep that arithmetic exact, matching the bigint
 * discipline LedgerService enforces on every amount in this codebase. 550 = 5.50%.
 *
 * ## Why the interest method is a column and not a platform decision
 *
 * Flat interest is charged on the original principal for the whole term; declining interest only
 * on the balance still owed. At the same nominal rate the first costs the borrower far more, and
 * both are in daily use — a Congolese IMF typically quotes flat, its neighbour may not. Storing a
 * rate without saying which method it belongs to would make every future repayment schedule wrong.
 *
 * ## Why publication is reviewed
 *
 * A product reaches borrowers through TumaPlus's own app, under TumaPlus's name. `pending_review`
 * means no institution publishes a rate to that audience without someone here having read it.
 */
export default class extends BaseSchema {
  protected tableName = 'financial_products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('provider_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('businesses')
        .comment('The institution selling this product')
      table.string('code', 50).notNullable().comment('Stable identifier, unique per provider')
      table.string('name').notNullable()
      table.text('description').nullable()
      table
        .enum('kind', ['savings', 'term_deposit', 'loan'])
        .notNullable()
        .comment('Shapes which of the columns below are meaningful')
      table.string('currency_code', 3).notNullable().defaultTo('USD')

      table.bigInteger('min_amount').nullable().comment('Smallest unit; null means no floor')
      table.bigInteger('max_amount').nullable().comment('Smallest unit; null means no ceiling')

      table
        .integer('interest_rate_bps')
        .notNullable()
        .defaultTo(0)
        .comment('Basis points: 550 = 5.50%. Zero is a legitimate rate, not a missing one')
      table
        .enum('interest_period', ['month', 'year'])
        .notNullable()
        .defaultTo('year')
        .comment('The period interest_rate_bps is quoted for')
      table
        .enum('interest_method', ['flat', 'declining'])
        .nullable()
        .comment('Loans only: on original principal, or on the balance outstanding')

      table.integer('term_months_min').nullable().comment('Null for an open-ended product')
      table.integer('term_months_max').nullable()

      table
        .bigInteger('fee_flat')
        .nullable()
        .comment('Fixed arrangement fee, smallest unit; institutions often charge both')
      table.integer('fee_percent_bps').nullable().comment('Arrangement fee as basis points')
      table
        .integer('mandatory_savings_bps')
        .nullable()
        .comment('Share of a loan held as compulsory savings before release, in basis points')

      table
        .enum('status', ['draft', 'pending_review', 'active', 'rejected', 'archived'])
        .notNullable()
        .defaultTo('draft')
      table.timestamp('submitted_at').nullable()
      table.timestamp('reviewed_at').nullable()
      table.integer('reviewed_by').nullable().unsigned().references('id').inTable('internal_users')
      table.text('review_notes').nullable().comment('Why it was rejected, shown to the provider')

      table.timestamps()

      table.unique(['provider_id', 'code'])
      table.index(['provider_id'])
      table.index(['status'])
      table.index(['kind'])
    })

    // A loan without an interest method would produce a schedule nobody can compute; the other
    // kinds accrue on a balance, where the distinction does not apply.
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT financial_products_loan_method
      CHECK ((kind = 'loan' AND interest_method IS NOT NULL)
          OR (kind <> 'loan' AND interest_method IS NULL));
    `)

    // Ranges that cannot be satisfied are a data-entry slip, not a product.
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT financial_products_amount_range
      CHECK (min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount);
    `)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD CONSTRAINT financial_products_term_range
      CHECK (term_months_min IS NULL OR term_months_max IS NULL
             OR term_months_min <= term_months_max);
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
