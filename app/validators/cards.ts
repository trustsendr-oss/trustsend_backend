import vine from '@vinejs/vine'

export const createCardValidator = vine.create({
  wallet_id: vine.number().positive(),
  brand: vine.enum(['VISA', 'MASTERCARD']),
  amount: vine.string().regex(/^[1-9]\d*$/), // smallest-unit, no zero, no leading zeros
  currency_code: vine.string().fixedLength(3).optional(), // defaults to USD — see cards_controller.ts
  // The User model has no phone column at all (see cards_controller.ts) — Payscribe's customer
  // creation requires one, so it's collected here, once, the first time this user creates a
  // card (CardService.ensureProviderCustomer reuses the same Payscribe customer afterwards).
  phone: vine.string().minLength(8).maxLength(20),
  // Catégorie achetée. Facultative : les clients qui n'ont pas encore été mis à jour
  // continuent d'émettre une carte sans catégorie, donc gratuite et sans plafond, comme avant
  // le catalogue — voir card_product_service.ts.
  card_product_id: vine.number().positive().optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

export const cardAmountValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

export const cardActionValidator = vine.create({
  idempotency_key: vine.string().uuid(),
})

export const listCardTransactionsValidator = vine.create({
  start_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  page: vine.number().positive().optional(),
  page_size: vine.number().positive().max(100).optional(),
})
