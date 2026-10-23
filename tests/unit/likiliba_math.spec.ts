import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { bpsOf, canonicalJson, dueDateOf, prorata, sha256 } from '#services/likiliba/shared'
import { drawOrder } from '#services/likiliba/likiliba_service'

test.group('Likiliba arithmetic', () => {
  test('commission and penalties round down, never in the platform’s favour', ({ assert }) => {
    assert.equal(bpsOf(1_234_567n, 100), 12_345n)
    assert.equal(bpsOf(99n, 100), 0n)
    assert.equal(bpsOf(2_000n, 100), 20n)
  })

  test('a pro-rata split always adds up to the total, and never exceeds a weight', ({ assert }) => {
    const shares = prorata(1_000n, [
      { key: 'a', weight: 333n },
      { key: 'b', weight: 333n },
      { key: 'c', weight: 334n },
    ])
    assert.equal(
      [...shares.values()].reduce((s, v) => s + v, 0n),
      1_000n
    )
    for (const [key, weight] of [
      ['a', 333n],
      ['b', 333n],
      ['c', 334n],
    ] as const) {
      assert.isTrue(shares.get(key)! <= weight)
    }

    const uneven = prorata(7n, [
      { key: 1, weight: 5n },
      { key: 2, weight: 5n },
      { key: 3, weight: 1n },
    ])
    assert.equal(
      [...uneven.values()].reduce((s, v) => s + v, 0n),
      7n
    )
    assert.isTrue(uneven.get(3)! <= 1n)
  })

  test('the draw is deterministic and does not depend on input order', ({ assert }) => {
    const seed = 'a'.repeat(64)
    const order = drawOrder(seed, [11, 12, 13, 14])
    assert.deepEqual(drawOrder(seed, [14, 13, 12, 11]), order)
    assert.sameMembers(order, [11, 12, 13, 14])
    assert.notDeepEqual(drawOrder('b'.repeat(64), [11, 12, 13, 14]), null)
  })

  test('rules hash the same whatever the key order', ({ assert }) => {
    assert.equal(
      sha256(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' } })),
      sha256(canonicalJson({ a: { c: 'x', d: [1, 2] }, b: 1 }))
    )
  })

  test('rounds follow the frequency', ({ assert }) => {
    const first = DateTime.fromISO('2026-01-31T10:00:00Z')
    assert.equal(dueDateOf(first, 'weekly', 2).toISODate(), '2026-02-14')
    assert.equal(dueDateOf(first, 'biweekly', 1).toISODate(), '2026-02-14')
    assert.equal(dueDateOf(first, 'monthly', 1).toISODate(), '2026-02-28')
  })
})
