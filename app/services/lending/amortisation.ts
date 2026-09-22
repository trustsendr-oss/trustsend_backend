import type { DateTime } from 'luxon'

export type InterestMethod = 'flat' | 'declining'
export type InterestPeriod = 'month' | 'year'

export interface ScheduleLine {
  /** 1-based, in the order they fall due. */
  installment: number
  dueAt: DateTime
  principal: bigint
  interest: bigint
  total: bigint
  /** Principal still owed once this line is paid; zero on the last. */
  outstandingAfter: bigint
}

export interface ScheduleParams {
  principal: bigint
  rateBps: number
  period: InterestPeriod
  termMonths: number
  method: InterestMethod
  firstDueAt: DateTime
}

/**
 * Repayment schedules, in exact integer arithmetic.
 *
 * ## The two methods are genuinely different products
 *
 * At the same quoted rate they cost the borrower very different amounts, which is why
 * financial_products stores the method beside the rate and refuses a loan that omits it.
 *
 * `flat` charges the whole term's interest on the ORIGINAL principal, however much has been repaid.
 * A 1000 loan at 5% a month over 6 months costs 300 in interest whether the borrower pays on time
 * or early. This is what most Congolese microfinance quotes.
 *
 * `declining` charges only on what is still owed, so the interest falls every month. The same
 * nominal 5% over 6 months costs 175 here — a little over half. Quoting one and computing the
 * other would misprice every loan in the book.
 *
 * ## Which `declining` this is
 *
 * Equal principal, falling interest (amortissement constant du capital): each instalment repays
 * the same slice of principal, and interest is charged on the balance outstanding. The other
 * common variant — a constant instalment, principal and interest shifting between them (annuity,
 * échéance constante) — is NOT implemented, deliberately: it needs a compound-interest power term
 * that cannot be evaluated exactly in integers, and a rounding drift inside a ledger this strict
 * is a worse problem than a slightly less familiar table. If a partner requires annuities it
 * should be a third method with its own tests, not a quiet change to this one.
 *
 * ## Rounding
 *
 * Every division rounds half up, and whatever the divisions lose is settled on the LAST
 * instalment, so the schedule always sums to exactly the principal lent. A borrower who pays every
 * line owes nothing; the final payment is the one that squares the account, which is also where a
 * field officer expects the odd cents to be.
 */
export function buildSchedule(params: ScheduleParams): ScheduleLine[] {
  const { principal, rateBps, termMonths, method, firstDueAt } = params

  if (principal <= 0n) throw new Error('A loan must have a positive principal')
  if (termMonths < 1) throw new Error('A loan must run for at least one month')
  if (rateBps < 0) throw new Error('A rate cannot be negative')

  const n = BigInt(termMonths)
  // A rate quoted per year is charged per month at a twelfth of it. Kept as a divisor rather than
  // dividing the rate itself, so an annual 5% never becomes a truncated monthly 0.41%.
  const monthsPerPeriod = params.period === 'year' ? 12n : 1n
  const denominator = 10_000n * monthsPerPeriod

  const principalPerLine = divideRoundHalfUp(principal, n)

  const lines: ScheduleLine[] = []
  let outstanding = principal
  let principalBooked = 0n
  let interestBooked = 0n

  const totalInterestFlat =
    method === 'flat' ? divideRoundHalfUp(principal * BigInt(rateBps) * n, denominator) : 0n
  const interestPerLineFlat = method === 'flat' ? divideRoundHalfUp(totalInterestFlat, n) : 0n

  for (let i = 1; i <= termMonths; i++) {
    const isLast = i === termMonths

    // The last line absorbs every rounding remainder, so the schedule sums to the exact principal.
    const linePrincipal = isLast ? principal - principalBooked : principalPerLine

    let lineInterest: bigint
    if (method === 'flat') {
      lineInterest = isLast ? totalInterestFlat - interestBooked : interestPerLineFlat
    } else {
      lineInterest = divideRoundHalfUp(outstanding * BigInt(rateBps), denominator)
    }

    principalBooked += linePrincipal
    interestBooked += lineInterest
    outstanding -= linePrincipal

    lines.push({
      installment: i,
      dueAt: firstDueAt.plus({ months: i - 1 }),
      principal: linePrincipal,
      interest: lineInterest,
      total: linePrincipal + lineInterest,
      outstandingAfter: outstanding,
    })
  }

  return lines
}

/** What a schedule costs in total, for quoting a borrower before they commit. */
export function scheduleTotals(lines: ScheduleLine[]): {
  principal: bigint
  interest: bigint
  total: bigint
} {
  return lines.reduce(
    (totals, line) => ({
      principal: totals.principal + line.principal,
      interest: totals.interest + line.interest,
      total: totals.total + line.total,
    }),
    { principal: 0n, interest: 0n, total: 0n }
  )
}

/**
 * Integer division rounding half away from zero, matching the commission arithmetic in
 * CashInService rather than truncating — truncation would systematically favour one side of every
 * loan in the book.
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero in a repayment schedule')
  return (numerator + denominator / 2n) / denominator
}
