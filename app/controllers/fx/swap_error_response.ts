import type { HttpContext } from '@adonisjs/core/http'

/**
 * Maps the swap and exchange-rate exceptions to HTTP responses, shared by the user and business
 * swap controllers. Returns false for anything else, which the caller rethrows.
 */
export function swapErrorResponse(error: unknown, response: HttpContext['response']): boolean {
  const err = error as Error & { code?: string }
  switch (err?.name) {
    case 'CurrencyNotSupportedException':
    case 'SameCurrencySwapException':
    case 'SwapAmountTooSmallException':
      response.unprocessableEntity({ message: err.message })
      return true
    case 'SwapWalletNotFoundException':
    case 'QuoteNotFoundException':
      response.notFound({ message: err.message })
      return true
    case 'InsufficientBalanceException':
      response.paymentRequired({ message: err.message })
      return true
    case 'TransactionLimitExceededException':
      response.badRequest({ message: err.message })
      return true
    case 'QuoteExpiredException':
      response.gone({ message: err.message, code: 'QUOTE_EXPIRED' })
      return true
    case 'QuoteAlreadyUsedException':
      response.conflict({ message: err.message, code: 'QUOTE_USED' })
      return true
    case 'ExchangeRateUnavailableException':
      response.serviceUnavailable({ message: err.message, code: 'RATE_UNAVAILABLE' })
      return true
    default:
      return false
  }
}
