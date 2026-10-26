import vine from '@vinejs/vine'

// EVM networks only, for deposits and withdrawals alike. Which ones are actually offered is
// decided per deployment (see crypto_networks.ts), not here.
const networkRule = vine.enum(['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'bsc'])
const tokenSymbolRule = vine.enum(['USDC', 'USDT', 'EURC'])
// Shape only; the checksum of a mixed-case address is verified by the payout service.
const addressRule = vine
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/)

// Deposits are EVM-only: their addresses are derived from an xpub (see deposit_address_deriver.ts).
export const createCryptoDepositAddressValidator = vine.create({
  network: networkRule,
  token_symbol: tokenSymbolRule,
  currency_code: vine.string().fixedLength(3).optional(),
})

export const createCryptoPayoutValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/), // Amount in hundredths of currency
  currency_code: vine.string().fixedLength(3).optional(),
  network: networkRule,
  token_symbol: tokenSymbolRule,
  destination_address: addressRule,
  memo_tag: vine.string().maxLength(50).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})
