import vine from '@vinejs/vine'
import { MAX_MARGIN_BPS } from '#services/fx/fx_math'

export const createSwapQuoteValidator = vine.create({
  from_currency: vine.string().trim().fixedLength(3),
  to_currency: vine.string().trim().fixedLength(3),
  // Smallest unit of from_currency, as a string (bigint on the server)
  amount: vine.string().regex(/^[1-9]\d{0,17}$/),
})

export const executeSwapValidator = vine.create({
  quote_id: vine.string().uuid(),
  idempotency_key: vine.string().uuid(),
  // Required for users and dashboard sessions, not for business API keys — checked in the controllers
  pin: vine.string().regex(/^\d{4}$/).optional(),
})

export const updateExchangeRateValidator = vine.create({
  // Units of the currency for 1 USD; null clears the override and falls back to the market rate
  manual_rate: vine
    .string()
    .trim()
    .regex(/^\d{1,18}(\.\d{1,12})?$/)
    .nullable()
    .optional(),
  margin_bps: vine.number().withoutDecimals().min(0).max(MAX_MARGIN_BPS).optional(),
})

export const listExchangeRatesValidator = vine.create({
  base: vine.string().trim().fixedLength(3).optional(),
})
