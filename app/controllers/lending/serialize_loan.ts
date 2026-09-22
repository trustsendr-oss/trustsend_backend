import type Loan from '#models/loan'
import type LoanSchedule from '#models/loan_schedule'

/** Amounts leave as digit strings: they are bigint smallest-unit values. */
export function serializeLoan(loan: Loan, schedule?: LoanSchedule[]) {
  return {
    id: loan.id,
    status: loan.status,
    currency_code: loan.currencyCode,
    principal: loan.principal.toString(),
    principal_outstanding: loan.principalOutstanding.toString(),
    interest_outstanding: loan.interestOutstanding.toString(),
    total_outstanding: loan.totalOutstanding.toString(),
    fees_charged: loan.feesCharged.toString(),
    // The terms agreed when they applied, which are not necessarily the product's terms today.
    interest_rate_percent: loan.interestRateBps / 100,
    interest_period: loan.interestPeriod,
    interest_method: loan.interestMethod,
    term_months: loan.termMonths,
    requested_at: loan.requestedAt,
    decided_at: loan.decidedAt,
    decision_notes: loan.decisionNotes,
    disbursed_at: loan.disbursedAt,
    closed_at: loan.closedAt,
    product: loan.product ? { id: loan.product.id, name: loan.product.name } : null,
    provider: loan.provider ? { id: loan.provider.id, name: loan.provider.name } : null,
    schedule: schedule?.map((line) => ({
      installment: line.installment,
      due_at: line.dueAt,
      principal: line.principal.toString(),
      interest: line.interest.toString(),
      total: line.total.toString(),
      paid: line.paid.toString(),
      remaining: line.remaining.toString(),
      overdue: line.isOverdue,
      settled_at: line.settledAt,
    })),
  }
}
