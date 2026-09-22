import vine from '@vinejs/vine'

/**
 * The customer is named by the 9-digit code they choose to share — the same identifier
 * DirectoryController resolves a payee by, and for the same reason: exact match only, never a
 * search, so the counter cannot become a way to enumerate accounts.
 *
 * The two PIN fields are named for whose PIN they are, because which one applies is the whole
 * security model here and a field called `pin` would hide it. A deposit only credits the customer
 * and debits the institution's float, so the teller authorises it. A withdrawal debits the
 * customer, so only the customer can.
 */
const customerCode = vine.string().regex(/^\d{9}$/)
const amount = vine.string().regex(/^[1-9]\d*$/)
const pin = vine.string().regex(/^\d{4}$/)

export const counterCashInValidator = vine.create({
  customer_code: customerCode,
  amount,
  currency_code: vine.string().fixedLength(3),
  teller_pin: pin,
  idempotency_key: vine.string().uuid(),
})

export const counterCashOutValidator = vine.create({
  customer_code: customerCode,
  amount,
  currency_code: vine.string().fixedLength(3),
  customer_pin: pin,
  idempotency_key: vine.string().uuid(),
})

export const counterConfirmValidator = vine.create({
  teller_pin: pin,
})
