import vine from '@vinejs/vine'

// Card top-ups (GoFreshPay Microform). The app only starts the checkout; the card itself is
// entered on the checkout page, in CyberSource's iframes, and never reaches these validators.

export const createCardDepositValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/), // hundredths, no zero, no leading zeros
  currency_code: vine.enum(['USD', 'CDF']),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

// A CyberSource transient token is a JWT; bounded so a junk body cannot be relayed upstream.
const transientTokenRule = vine.string().trim().minLength(20).maxLength(8000)

export const cardCheckoutSetupValidator = vine.create({
  transient_token: transientTokenRule,
})

export const cardCheckoutEnrollValidator = vine.create({
  transient_token: transientTokenRule,
  reference_id: vine.string().trim().minLength(1).maxLength(100),
  address_line1: vine.string().trim().minLength(3).maxLength(120),
  address_city: vine.string().trim().minLength(2).maxLength(60),
  address_country: vine
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/),
  // Same shape GoFreshPay enforces: digits, spaces, dashes, brackets, optional leading +.
  phone_number: vine
    .string()
    .trim()
    .regex(/^[\d+][\d\s\-()]{4,19}$/),
})

export const cardCheckoutChargeValidator = vine.create({
  transient_token: transientTokenRule,
})
