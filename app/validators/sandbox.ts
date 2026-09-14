import vine from '@vinejs/vine'

export const fundSandboxWalletValidator = vine.create({
  currency_code: vine.string().trim().fixedLength(3),
  // Smallest unit of the currency, as a string (bigint on the server)
  amount: vine.string().regex(/^[1-9]\d{0,17}$/),
  idempotency_key: vine.string().uuid(),
})
