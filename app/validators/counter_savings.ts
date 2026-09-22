import vine from '@vinejs/vine'

/**
 * Every savings movement at a counter carries the CUSTOMER's PIN, with no exception.
 *
 * Unlike cash, where a deposit risks only the institution's float and the teller therefore
 * authorises it, savings move the customer's own balance in both directions. A teller's PIN
 * standing in for any of it would let them lock a customer's money away, or release it, without
 * the holder having agreed. One rule, impossible to get the wrong way round.
 */
const customerPin = vine.string().regex(/^\d{4}$/)
const amount = vine.string().regex(/^[1-9]\d*$/)

export const counterOpenSavingsValidator = vine.create({
  customer_code: vine.string().regex(/^\d{9}$/),
  product_id: vine.number().positive(),
  initial_amount: amount.optional(),
  customer_pin: customerPin,
})

export const counterSavingsMovementValidator = vine.create({
  amount,
  customer_pin: customerPin,
})

export const counterSavingsLookupValidator = vine.create({
  customer_code: vine.string().regex(/^\d{9}$/),
})
