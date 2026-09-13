import vine from '@vinejs/vine'


/**
 * Validator for P2P transfer requests
 */
export const createP2pTransferValidator = vine.create({
  recipient_wallet_id: vine.number().positive(),
  amount: vine.string().regex(/^[1-9]\d*$/), // digits only, no zero, no leading zeros
  // Format only — the transfer must match both wallets' currency, which p2p_transfer_service.ts
  // enforces; the currencies table (CurrencyService) is the reference for which codes exist.
  currency_code: vine.string().fixedLength(3).optional(), // defaults to USD
  description: vine.string().maxLength(255).optional(),
  metadata: vine.any().optional(),
  idempotency_key: vine.string().uuid(), // Made required for financial safety
  pin: vine.string().regex(/^\d{4}$/), // PIN required: exactly 4 digits
})

/**
 * Validator for listing transfers (pagination)
 */
export const listTransfersValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
})
