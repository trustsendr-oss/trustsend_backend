import vine from '@vinejs/vine'

/** Amounts are smallest-unit digit strings bound for bigint columns. */
const amount = vine.string().regex(/^[1-9]\d*$/)
const pin = vine.string().regex(/^\d{4}$/)

export const requestLoanValidator = vine.create({
  product_id: vine.number().positive(),
  amount,
  // Applying commits nobody to anything, but it is a financial act in the borrower's name, so it
  // is authorised like one.
  pin,
})

export const repayLoanValidator = vine.create({ amount, pin })

export const rejectLoanValidator = vine.create({
  // Required: a refusal a borrower cannot understand is one they will simply reapply against.
  notes: vine.string().minLength(5).maxLength(2000),
})
