import vine from '@vinejs/vine'

export const createBusinessWalletValidator = vine.create({
  currency_code: vine.string().fixedLength(3),
})
