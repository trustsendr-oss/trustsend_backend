import type FinancialProduct from '#models/financial_product'

/**
 * One shape for a product across the institution, admin and borrower views.
 *
 * Amounts leave as digit strings, never JSON numbers: they are bigint smallest-unit values, and a
 * number would silently lose precision at the top of the range. Rates leave as the integer basis
 * points they are stored as, plus a `_percent` rendering, so a client never has to know that 550
 * means 5.50% — and never has to divide by 100 itself and get it wrong.
 */
export function serializeProduct(product: FinancialProduct) {
  return {
    id: product.id,
    provider_id: product.providerId,
    provider_name: product.provider?.name ?? null,
    code: product.code,
    name: product.name,
    description: product.description,
    kind: product.kind,
    currency_code: product.currencyCode,
    min_amount: product.minAmount?.toString() ?? null,
    max_amount: product.maxAmount?.toString() ?? null,
    interest_rate_bps: product.interestRateBps,
    interest_rate_percent: product.interestRateBps / 100,
    interest_period: product.interestPeriod,
    interest_method: product.interestMethod,
    term_months_min: product.termMonthsMin,
    term_months_max: product.termMonthsMax,
    fee_flat: product.feeFlat?.toString() ?? null,
    fee_percent_bps: product.feePercentBps,
    mandatory_savings_bps: product.mandatorySavingsBps,
    status: product.status,
    submitted_at: product.submittedAt,
    reviewed_at: product.reviewedAt,
    review_notes: product.reviewNotes,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  }
}
