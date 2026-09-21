import vine from '@vinejs/vine'

const KINDS = ['savings', 'term_deposit', 'loan'] as const
const PERIODS = ['month', 'year'] as const
const METHODS = ['flat', 'declining'] as const

/**
 * Amounts arrive as digit strings, not numbers: they are smallest-unit values that end up in
 * bigint columns, and JSON numbers lose precision long before a bigint does. Rates arrive as
 * integer basis points for the reason the migration gives — 550 is 5.50%.
 *
 * `interest_method` is validated as optional here and enforced by the database constraint
 * financial_products_loan_method, which is where the rule (loans must state one, other kinds must
 * not) can be stated once for every writer rather than per endpoint.
 */
const amount = vine.string().regex(/^(0|[1-9]\d*)$/)
const bps = vine.number().min(0).max(100_000)

export const createFinancialProductValidator = vine.create({
  code: vine.string().minLength(2).maxLength(50),
  name: vine.string().minLength(2).maxLength(255),
  description: vine.string().maxLength(2000).optional(),
  kind: vine.enum(KINDS),
  currency_code: vine.string().fixedLength(3),
  min_amount: amount.optional(),
  max_amount: amount.optional(),
  interest_rate_bps: bps,
  interest_period: vine.enum(PERIODS),
  interest_method: vine.enum(METHODS).optional(),
  term_months_min: vine.number().min(1).max(600).optional(),
  term_months_max: vine.number().min(1).max(600).optional(),
  fee_flat: amount.optional(),
  fee_percent_bps: bps.optional(),
  mandatory_savings_bps: bps.optional(),
})

export const updateFinancialProductValidator = vine.create({
  name: vine.string().minLength(2).maxLength(255).optional(),
  description: vine.string().maxLength(2000).optional(),
  min_amount: amount.optional(),
  max_amount: amount.optional(),
  interest_rate_bps: bps.optional(),
  interest_period: vine.enum(PERIODS).optional(),
  interest_method: vine.enum(METHODS).optional(),
  term_months_min: vine.number().min(1).max(600).optional(),
  term_months_max: vine.number().min(1).max(600).optional(),
  fee_flat: amount.optional(),
  fee_percent_bps: bps.optional(),
  mandatory_savings_bps: bps.optional(),
})

export const rejectFinancialProductValidator = vine.create({
  // Required: a refusal without a reason only produces a resubmission of the same thing.
  notes: vine.string().minLength(5).maxLength(2000),
})

export const listPublishedProductsValidator = vine.create({
  kind: vine.enum(KINDS).optional(),
  currency_code: vine.string().fixedLength(3).optional(),
})
