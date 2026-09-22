import vine from '@vinejs/vine'

/**
 * Cash amounts arrive as digit strings, not JSON numbers: they are smallest-unit values destined
 * for bigint columns, and a number would lose precision long before a bigint does.
 *
 * At least one currency line is required in both directions — a drawer nobody declared and a
 * drawer nobody counted are the two ways a shift stops being a control.
 */
const cashLines = vine
  .array(
    vine.object({
      currency_code: vine.string().fixedLength(3),
      amount: vine.string().regex(/^(0|[1-9]\d*)$/),
    })
  )
  .minLength(1)

export const openTellerSessionValidator = vine.create({
  opening_cash: cashLines,
})

export const closeTellerSessionValidator = vine.create({
  counted_cash: cashLines,
  notes: vine.string().maxLength(2000).optional(),
})

export const reconcileTellerSessionValidator = vine.create({
  notes: vine.string().maxLength(2000).optional(),
})
