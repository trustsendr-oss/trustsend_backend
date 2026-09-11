import vine from '@vinejs/vine'

// Provider codes are NOT a fixed list — PawaPay's own docs say they must be treated as
// dynamically fetched from the merchant's active configuration (they vary by account and
// change without a PawaPay API change). Format is checked here; whether a given code is
// actually supported for the requested currency/operation is validated against PawaPay's
// live active-conf in the controller (PawaPayProvider.getProviderConfig).
const providerCodeRule = vine.string().regex(/^[A-Z0-9_]{3,40}$/)

export const createMobileMoneyDepositValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/), // no zero, no leading zeros
  currency_code: vine.string().fixedLength(3),
  // ISO 3166-1 alpha-3 (matches predictProviderValidator's `country` below). Optional and not
  // otherwise used by this endpoint — its only consumer is business_plan_middleware.ts, which
  // reads it straight off the request to let a plan restrict this feature to specific countries
  // (see Plan.hasFeature()). A caller who never sends it just can't be scoped by country here.
  country_code: vine.string().fixedLength(3).optional(),
  phone_number: vine.string().regex(/^[1-9]\d{7,14}$/), // MSISDN: digits only, no leading zero
  provider: providerCodeRule,
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

export const createMobileMoneyPayoutValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/),
  currency_code: vine.string().fixedLength(3),
  country_code: vine.string().fixedLength(3).optional(), // see createMobileMoneyDepositValidator
  phone_number: vine.string().regex(/^[1-9]\d{7,14}$/),
  provider: providerCodeRule,
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

export const predictProviderValidator = vine.create({
  phone_number: vine.string().regex(/^[1-9]\d{7,14}$/),
  country: vine.string().fixedLength(3).optional(),
})

export const listPaymentMethodsValidator = vine.create({
  currency_code: vine.string().fixedLength(3),
  operation_type: vine.enum(['DEPOSIT', 'PAYOUT']).optional(),
})
