/**
 * Fixed-point exchange-rate arithmetic. Rates never touch a float once parsed: they are bigints
 * scaled by 10^12, and amounts stay bigints in the ledger's unit (hundredths of the currency for
 * every currency — see pawapay_provider.formatAmount).
 */
export const RATE_DECIMALS = 12
export const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS)
export const MAX_MARGIN_BPS = 2000

/** "2304.931274" or 2304.931274 → 2304931274000000n. Throws on anything not strictly positive. */
export function parseRate(value: string | number): bigint {
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid rate: ${value}`)
    text = value.toFixed(RATE_DECIMALS)
  } else {
    text = value.trim()
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) throw new Error(`Invalid rate: ${value}`)

  const fraction = (match[2] ?? '').slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, '0')
  const scaled = BigInt(match[1]) * RATE_SCALE + BigInt(fraction)
  if (scaled <= 0n) throw new Error(`Invalid rate: ${value}`)
  return scaled
}

/** 2304931274000000n → "2304.931274" (at most `digits` decimals, trailing zeros trimmed). */
export function formatRate(scaled: bigint, digits = 8): string {
  const whole = scaled / RATE_SCALE
  const fraction = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, '0').slice(0, digits)
  const trimmed = fraction.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}

/** Units of `to` for one unit of `from`, both rates being expressed per 1 USD. */
export function crossRate(fromPerUsd: bigint, toPerUsd: bigint): bigint {
  return (toPerUsd * RATE_SCALE) / fromPerUsd
}

/** The rate a customer actually gets once the margin is taken. */
export function applyMargin(rate: bigint, marginBps: number): bigint {
  return (rate * BigInt(10000 - marginBps)) / 10000n
}

export interface Conversion {
  /** Converted at the mid-market rate, before any margin. */
  midAmount: bigint
  /** What the customer receives. */
  amountOut: bigint
  /** midAmount - amountOut, in the target currency: the margin plus rounding. */
  fee: bigint
}

/**
 * Converts `amountIn` (ledger unit of the source currency) into the target currency.
 *
 * Everything rounds in the platform's favour (never creating money): the mid amount is floored,
 * the margin ceiled, and a currency without minor units (XAF, RWF…) is rounded down to a whole
 * unit so it can actually be paid out.
 */
export function convert(input: {
  amountIn: bigint
  fromPerUsd: bigint
  toPerUsd: bigint
  marginBps: number
  toDecimals: number
}): Conversion {
  if (input.amountIn <= 0n) throw new Error('Amount must be positive')
  if (input.marginBps < 0 || input.marginBps > MAX_MARGIN_BPS) {
    throw new Error(`Margin must be between 0 and ${MAX_MARGIN_BPS} bps`)
  }

  const midAmount = (input.amountIn * input.toPerUsd) / input.fromPerUsd
  const margin = (midAmount * BigInt(input.marginBps) + 9999n) / 10000n

  let amountOut = midAmount - margin
  const unit = 10n ** BigInt(2 - Math.min(Math.max(input.toDecimals, 0), 2))
  amountOut -= amountOut % unit

  return { midAmount, amountOut, fee: midAmount - amountOut }
}
