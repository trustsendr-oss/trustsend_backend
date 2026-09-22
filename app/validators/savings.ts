import vine from '@vinejs/vine'

/**
 * Amounts are smallest-unit digit strings bound for bigint columns; a JSON number would lose
 * precision long before a bigint does.
 *
 * Every movement carries a PIN. Opening and depositing take money out of what the holder can
 * spend, and withdrawing and closing bring it back — all four change a balance, so all four are
 * authorised the same way every other money path in this codebase is.
 */
const amount = vine.string().regex(/^[1-9]\d*$/)
const pin = vine.string().regex(/^\d{4}$/)

export const openSavingsValidator = vine.create({
  product_id: vine.number().positive(),
  initial_amount: amount.optional(),
  pin,
})

export const savingsMovementValidator = vine.create({
  amount,
  pin,
})

export const closeSavingsValidator = vine.create({ pin })
