import { test } from '@japa/runner'
import {
  applyMargin,
  convert,
  crossRate,
  formatRate,
  parseRate,
  RATE_SCALE,
} from '#services/fx/fx_math'

test.group('fx_math', () => {
  test('parses and formats rates without floating point drift', ({ assert }) => {
    assert.equal(parseRate('2304.931274'), 2304931274000000n)
    assert.equal(parseRate(2304.931274), 2304931274000000n)
    assert.equal(parseRate('1'), RATE_SCALE)
    assert.equal(formatRate(2304931274000000n), '2304.931274')
    assert.equal(formatRate(RATE_SCALE), '1')
  })

  test('rejects zero, negative and malformed rates', ({ assert }) => {
    assert.throws(() => parseRate('0'))
    assert.throws(() => parseRate(-1))
    assert.throws(() => parseRate('1e3'))
    assert.throws(() => parseRate('abc'))
  })

  test('computes cross rates through USD', ({ assert }) => {
    const eur = parseRate('0.861838')
    const cdf = parseRate('2304.931274')
    assert.equal(formatRate(crossRate(RATE_SCALE, cdf)), '2304.931274')
    assert.equal(formatRate(crossRate(eur, cdf), 4), '2674.4368')
  })

  test('converts at the mid rate when there is no margin', ({ assert }) => {
    // 10.00 USD → CDF
    const result = convert({
      amountIn: 1000n,
      fromPerUsd: RATE_SCALE,
      toPerUsd: parseRate('2304.931274'),
      marginBps: 0,
      toDecimals: 2,
    })
    assert.equal(result.midAmount, 2304931n)
    assert.equal(result.amountOut, 2304931n)
    assert.equal(result.fee, 0n)
  })

  test('takes the margin in the target currency, rounded up', ({ assert }) => {
    const result = convert({
      amountIn: 1000n,
      fromPerUsd: RATE_SCALE,
      toPerUsd: parseRate('2304.931274'),
      marginBps: 150,
      toDecimals: 2,
    })
    assert.equal(result.fee, 34574n)
    assert.equal(result.amountOut, 2270357n)
    assert.equal(formatRate(applyMargin(parseRate('2304.931274'), 150), 6), '2270.357304')
  })

  test('rounds currencies without minor units down to a whole unit', ({ assert }) => {
    // 10.00 USD → XAF at 565.328212: 5653.28 XAF, paid as 5653 XAF
    const result = convert({
      amountIn: 1000n,
      fromPerUsd: RATE_SCALE,
      toPerUsd: parseRate('565.328212'),
      marginBps: 0,
      toDecimals: 0,
    })
    assert.equal(result.amountOut, 565300n)
    assert.equal(result.fee, 28n)
  })

  test('refuses non-positive amounts and out-of-range margins', ({ assert }) => {
    const base = { fromPerUsd: RATE_SCALE, toPerUsd: RATE_SCALE, toDecimals: 2 }
    assert.throws(() => convert({ ...base, amountIn: 0n, marginBps: 0 }))
    assert.throws(() => convert({ ...base, amountIn: 100n, marginBps: 5000 }))
  })
})
