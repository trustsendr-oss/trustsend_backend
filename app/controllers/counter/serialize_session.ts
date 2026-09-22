import type TellerSession from '#models/teller_session'

/**
 * Amounts leave as digit strings for the same reason they arrive as them — they are bigint
 * smallest-unit values. `variance` is signed: negative is a shortfall, positive a surplus, and the
 * sign is what the reader is looking for, so it is never sent as an absolute value with a flag.
 */
export function serializeSession(session: TellerSession) {
  return {
    id: session.id,
    business_id: session.businessId,
    agent_id: session.agentId,
    staff_id: session.staffId,
    status: session.status,
    opened_at: session.openedAt,
    closed_at: session.closedAt,
    reconciled_at: session.reconciledAt,
    reconciled_by: session.reconciledBy,
    notes: session.notes,
    balances: (session.balances ?? []).map((balance) => ({
      currency_code: balance.currencyCode,
      opening_cash: balance.openingCash.toString(),
      counted_cash: balance.countedCash?.toString() ?? null,
      expected_cash: balance.expectedCash?.toString() ?? null,
      variance: balance.variance?.toString() ?? null,
    })),
  }
}
