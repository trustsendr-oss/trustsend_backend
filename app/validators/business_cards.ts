import vine from '@vinejs/vine'

/**
 * PIN is optional here (unlike app/validators/cards.ts's user equivalent, where it's always
 * required) — the business/cards_controller.ts actions are shared between an API-key caller
 * (no PIN, the key itself is the credential) and a dashboard session (PIN required), gated on
 * `businessAuthMethod` in the controller. Mirrors subscribeToPlanValidator's pattern, not
 * mobile_money.ts's createMobileMoneyDepositValidator — that one makes `pin` unconditionally
 * required even though its own controller only ever checks it for a dashboard call, which means
 * an API-key caller there has to send a throwaway PIN value that's silently never verified.
 */
export const createBusinessCardValidator = vine.create({
  wallet_id: vine.number().positive(),
  brand: vine.enum(['VISA', 'MASTERCARD']),
  amount: vine.string().regex(/^[1-9]\d*$/), // smallest-unit, no zero, no leading zeros
  currency_code: vine.string().fixedLength(3).optional(), // defaults to USD — cards are USD-only
  pin: vine.string().regex(/^\d{4}$/).optional(),
  idempotency_key: vine.string().uuid(),
})

export const businessCardAmountValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/),
  pin: vine.string().regex(/^\d{4}$/).optional(),
  idempotency_key: vine.string().uuid(),
})

export const businessCardActionValidator = vine.create({
  idempotency_key: vine.string().uuid(),
})

export const listBusinessCardTransactionsValidator = vine.create({
  start_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  page: vine.number().positive().optional(),
  page_size: vine.number().positive().max(100).optional(),
})
