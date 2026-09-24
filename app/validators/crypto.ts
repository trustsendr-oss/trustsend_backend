import vine from '@vinejs/vine'

const networkRule = vine.enum(['polygon', 'base', 'arbitrum', 'optimism', 'ethereum', 'solana'])
const tokenSymbolRule = vine.enum(['USDC', 'USDT', 'EURC'])
const addressRule = vine.string().regex(/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/)

export const createCryptoDepositAddressValidator = vine.create({
  network: networkRule,
  token_symbol: tokenSymbolRule.optional(),
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
