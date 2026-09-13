import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { createBusinessWalletValidator } from '#validators/business_wallet'
import {
  CurrencyService,
  CurrencyNotSupportedException,
  type SerializedCurrency,
} from '#services/money/currency_service'

/**
 * logo_url and currency come from the currencies table (CurrencyService). flag_url is the same
 * URL, kept so integrations written against the previous response shape keep working.
 */
function currencyFields(currency: SerializedCurrency) {
  return { logo_url: currency.logo_url, flag_url: currency.logo_url, currency }
}

export default class BusinessWalletController {
  /**
   * POST /api/v1/business/wallet
   * Self-service: create a wallet in a new currency, beyond the single USD wallet allocated
   * at signup. Idempotent — calling it again for a currency that already has a wallet just
   * returns that wallet (200, not 201). The currency must be active in the currencies table.
   */
  async store({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createBusinessWalletValidator)
    const currencyCode = CurrencyService.normalize(payload.currency_code)

    let currency
    try {
      currency = await CurrencyService.requireActive(currencyCode)
    } catch (error) {
      if (error instanceof CurrencyNotSupportedException) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }

    const { wallet, created } = await BusinessOnboardingService.createWallet(
      business.id,
      currencyCode,
      correlationId
    )

    return response.status(created ? 201 : 200).send({
      data: {
        id: wallet.id,
        currency_code: wallet.currencyCode,
        ...currencyFields(CurrencyService.serialize(currency)),
        balance: wallet.balanceCache.toString(),
        status: wallet.status,
        created_at: wallet.createdAt,
      },
      message: created ? 'Wallet created' : 'Wallet already exists for this currency',
    })
  }

  /**
   * GET /api/v1/business/wallet
   * List all of this business's wallets (one per currency).
   */
  async index({ business, response }: HttpContext) {
    const wallets = await Wallet.query()
      .where('business_id', business.id)
      .select('id', 'currency_code', 'balance_cache', 'status', 'created_at', 'updated_at')
      .orderBy('created_at', 'asc')

    const currencies = await CurrencyService.serializeMany(wallets.map((w) => w.currencyCode))

    return response.ok({
      data: wallets.map((wallet) => ({
        id: wallet.id,
        currency_code: wallet.currencyCode,
        ...currencyFields(currencies.get(wallet.currencyCode)!),
        balance: wallet.balanceCache.toString(),
        status: wallet.status,
        created_at: wallet.createdAt,
        updated_at: wallet.updatedAt,
      })),
    })
  }

  /**
   * GET /api/v1/business/wallet/:currency
   */
  async show({ business, params, response }: HttpContext) {
    const wallet = await Wallet.query()
      .where('business_id', business.id)
      .where('currency_code', CurrencyService.normalize(String(params.currency)))
      .first()

    if (!wallet) {
      return response.notFound({ message: `No wallet found for currency ${params.currency}` })
    }

    const currencies = await CurrencyService.serializeMany([wallet.currencyCode])

    return response.ok({
      data: {
        id: wallet.id,
        currency_code: wallet.currencyCode,
        ...currencyFields(currencies.get(wallet.currencyCode)!),
        balance: wallet.balanceCache.toString(),
        status: wallet.status,
        per_transaction_limit: wallet.perTransactionLimit?.toString() || null,
        daily_limit: wallet.dailyLimit?.toString() || null,
        monthly_limit: wallet.monthlyLimit?.toString() || null,
        created_at: wallet.createdAt,
        updated_at: wallet.updatedAt,
      },
    })
  }
}
