import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import type CryptoDepositAddress from '#models/crypto_deposit_address'
import type Wallet from '#models/wallet'
import {
  networkSpec,
  TOKEN_CURRENCY,
  type EvmNetwork,
  type StablecoinSymbol,
} from '#services/crypto/crypto_networks'

/** Shared by the user and business controllers: same address payload, same error mapping. */
export function depositAddressPayload(address: CryptoDepositAddress, wallet: Wallet) {
  const network = address.network as EvmNetwork
  return {
    network,
    token_symbol: address.tokenSymbol,
    address: address.address,
    memo_tag: address.memoTag,
    currency_code: TOKEN_CURRENCY[address.tokenSymbol as StablecoinSymbol] ?? wallet.currencyCode,
    wallet_id: wallet.id,
    required_confirmations: networkSpec(network)?.confirmations ?? null,
    testnet_name: networkSpec(network)?.testnetName ?? null,
    created_at: address.createdAt,
  }
}

export function respondToDepositError(error: unknown, response: HttpContext['response']) {
  const name = (error as Error)?.name
  const message = (error as Error)?.message
  switch (name) {
    case 'CryptoDepositRailUnavailableException':
      return response.unprocessableEntity({ code: 'CRYPTO_RAIL_UNAVAILABLE', message })
    case 'CryptoDepositCurrencyMismatchException':
      return response.unprocessableEntity({ code: 'CRYPTO_CURRENCY_MISMATCH', message })
    case 'CryptoDepositWalletMissingException':
      return response.notFound({ code: 'WALLET_NOT_FOUND', message })
    case 'CryptoDepositsNotConfiguredException':
      logger.error({ err: error }, 'crypto deposits misconfigured')
      return response.serviceUnavailable({
        code: 'CRYPTO_DEPOSITS_UNAVAILABLE',
        message: 'Crypto deposits are temporarily unavailable.',
      })
    default:
      // Most likely Alchemy refusing to watch the address: the address was rolled back.
      logger.error({ err: error }, 'crypto deposit address could not be issued')
      return response.serviceUnavailable({
        code: 'CRYPTO_DEPOSITS_UNAVAILABLE',
        message: 'Crypto deposits are temporarily unavailable. Please try again later.',
      })
  }
}
