import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { buildSchedule, scheduleTotals } from '#services/lending/amortisation'

const FIRST_DUE = DateTime.fromISO('2026-01-15T00:00:00Z')

/**
 * The repayment schedule, checked against figures anybody can verify on paper.
 *
 * This is the calculation with the most room to be quietly wrong: it runs unattended over every
 * loan in a book, and an error of a few units per line only becomes visible once a borrower
 * disputes a balance months later. The two methods are therefore pinned to worked examples rather
 * than to whatever the code currently produces.
 */
test.group('Repayment schedules', () => {
  test('flat interest charges the whole term on the original principal', ({ assert }) => {
    // 1000.00 at 5% a month for 6 months. Flat: 1000 × 5% × 6 = 300.00 of interest, whatever gets
    // repaid along the way. Principal 1000/6 = 166.67 a month.
    const lines = buildSchedule({
      principal: 1_000_00n,
      rateBps: 500,
      period: 'month',
      termMonths: 6,
      method: 'flat',
      firstDueAt: FIRST_DUE,
    })

    assert.lengthOf(lines, 6)
    assert.equal(lines[0].principal, 166_67n)
    assert.equal(lines[0].interest, 50_00n, 'a flat sixth of 300.00')
    assert.equal(lines[0].total, 216_67n)

    // Interest never falls: that is what makes it flat.
    assert.equal(lines[5].interest, 50_00n)

    const totals = scheduleTotals(lines)
    assert.equal(totals.principal, 1_000_00n)
    assert.equal(totals.interest, 300_00n)
    assert.equal(totals.total, 1_300_00n)
  })

  test('declining interest charges only what is still owed', ({ assert }) => {
    // Same loan, declining. Principal 166.67 a month; interest 5% of the balance outstanding:
    // 50.00, 41.67, 33.33, 25.00, 16.67, 8.33 → 175.00, a little over half the flat cost.
    const lines = buildSchedule({
      principal: 1_000_00n,
      rateBps: 500,
      period: 'month',
      termMonths: 6,
      method: 'declining',
      firstDueAt: FIRST_DUE,
    })

    assert.equal(lines[0].interest, 50_00n)
    assert.equal(lines[1].interest, 41_67n)
    assert.equal(lines[2].interest, 33_33n)
    assert.equal(lines[5].interest, 8_33n)

    const totals = scheduleTotals(lines)
    assert.equal(totals.principal, 1_000_00n)
    assert.equal(totals.interest, 175_00n)
  })

  test('the same quoted rate costs very different amounts', ({ assert }) => {
    const params = {
      principal: 1_000_00n,
      rateBps: 500,
      period: 'month' as const,
      termMonths: 6,
      firstDueAt: FIRST_DUE,
    }

    const flat = scheduleTotals(buildSchedule({ ...params, method: 'flat' }))
    const declining = scheduleTotals(buildSchedule({ ...params, method: 'declining' }))

    // Quoting one and computing the other would misprice every loan in the book by this much.
    assert.equal(flat.interest, 300_00n)
    assert.equal(declining.interest, 175_00n)
    assert.isAbove(Number(flat.interest), Number(declining.interest))
  })

  test('an annual rate is charged monthly, without truncating the rate', ({ assert }) => {
    // 1200.00 at 12% a YEAR for 12 months, flat: 1200 × 12% × 12/12 = 144.00.
    const lines = buildSchedule({
      principal: 1_200_00n,
      rateBps: 1200,
      period: 'year',
      termMonths: 12,
      method: 'flat',
      firstDueAt: FIRST_DUE,
    })

    const totals = scheduleTotals(lines)
    assert.equal(totals.interest, 144_00n)
    assert.equal(lines[0].interest, 12_00n)
  })

  test('an awkward principal still sums to exactly what was lent', ({ assert }) => {
    // 100.00 over 3 months: 33.33 a month leaves a cent that has to land somewhere.
    const lines = buildSchedule({
      principal: 100_00n,
      rateBps: 300,
      period: 'month',
      termMonths: 3,
      method: 'declining',
      firstDueAt: FIRST_DUE,
    })

    assert.equal(lines[0].principal, 33_33n)
    assert.equal(lines[1].principal, 33_33n)
    assert.equal(lines[2].principal, 33_34n, 'the last line squares the account')

    const totals = scheduleTotals(lines)
    assert.equal(totals.principal, 100_00n, 'not a cent invented or lost')
    assert.equal(lines[2].outstandingAfter, 0n)
  })

  test('nothing is owed once the last line is paid, at any term', ({ assert }) => {
    for (const termMonths of [1, 2, 5, 7, 11, 13, 24, 36]) {
      for (const method of ['flat', 'declining'] as const) {
        const lines = buildSchedule({
          principal: 777_77n,
          rateBps: 435,
          period: 'month',
          termMonths,
          method,
          firstDueAt: FIRST_DUE,
        })

        const totals = scheduleTotals(lines)
        assert.equal(
          totals.principal,
          777_77n,
          `principal drifted at ${termMonths} months, ${method}`
        )
        assert.equal(
          lines.at(-1)!.outstandingAfter,
          0n,
          `still owing at ${termMonths} months, ${method}`
        )
        assert.equal(totals.total, totals.principal + totals.interest)
      }
    }
  })

  test('instalments fall a month apart from the first due date', ({ assert }) => {
    const lines = buildSchedule({
      principal: 300_00n,
      rateBps: 100,
      period: 'month',
      termMonths: 3,
      method: 'flat',
      firstDueAt: FIRST_DUE,
    })

    assert.equal(lines[0].dueAt.toISODate(), '2026-01-15')
    assert.equal(lines[1].dueAt.toISODate(), '2026-02-15')
    assert.equal(lines[2].dueAt.toISODate(), '2026-03-15')
  })

  test('an interest-free loan is a schedule of pure principal', ({ assert }) => {
    const lines = buildSchedule({
      principal: 500_00n,
      rateBps: 0,
      period: 'month',
      termMonths: 5,
      method: 'declining',
      firstDueAt: FIRST_DUE,
    })

    assert.equal(scheduleTotals(lines).interest, 0n)
    assert.equal(scheduleTotals(lines).principal, 500_00n)
  })

  test('nonsense is refused rather than producing a table', ({ assert }) => {
    const base = {
      rateBps: 500,
      period: 'month' as const,
      termMonths: 6,
      method: 'flat' as const,
      firstDueAt: FIRST_DUE,
    }

    assert.throws(() => buildSchedule({ ...base, principal: 0n }), 'positive principal')
    assert.throws(() => buildSchedule({ ...base, principal: 100n, termMonths: 0 }), 'at least one')
    assert.throws(
      () => buildSchedule({ ...base, principal: 100n, rateBps: -1 }),
      'cannot be negative'
    )
  })
})
