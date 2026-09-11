import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import Wallet from '#models/wallet'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { createBusinessWalletValidator } from '#validators/business_wallet'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'

const provider = new PawaPayProvider()

/**
 * Never let a PawaPay hiccup break the wallet listing — a missing flag just renders as null.
 * USD is special-cased to our own server: it's our primary wallet currency, and PawaPay's
 * active-conf ties its flag to whichever configured country happens to offer USD first — not
 * meaningfully "the" USD country — so we serve our own icon instead of an arbitrary one.
 */
async function safeFlagForCurrency(currencyCode: string): Promise<string | null> {
  if (currencyCode === 'USD') {
    return `${env.get('APP_URL')}/assets/flags/usd.svg`
  }
  try {
    return await provider.getFlagForCurrency(currencyCode)
  } catch {
    return null
  }
}

export default class BusinessWalletController {
  /**
   * POST /api/v1/business/wallet
   * Self-service: create a wallet in a new currency, beyond the single USD wallet allocated
   * at signup. Idempotent — calling it again for a currency that already has a wallet just
   * returns that wallet (200, not 201).
   */
  async store({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createBusinessWalletValidator)
    const currencyCode = payload.currency_code.toUpperCase()

    const { wallet, created } = await BusinessOnboardingService.createWallet(
      business.id,
      currencyCode,
      correlationId
    )

    return response.status(created ? 201 : 200).send({
      data: {
        id: wallet.id,
        currency_code: wallet.currencyCode,
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

    const uniqueCurrencies = [...new Set(wallets.map((w) => w.currencyCode))]
    const flagEntries = await Promise.all(
      uniqueCurrencies.map(async (currency) => [currency, await safeFlagForCurrency(currency)] as const)
    )
    const flagByCurrency = new Map(flagEntries)

    return response.ok({
      data: wallets.map((wallet) => ({
        id: wallet.id,
        currency_code: wallet.currencyCode,
        flag_url: flagByCurrency.get(wallet.currencyCode) ?? null,
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
      .where('currency_code', params.currency.toUpperCase())
      .first()

    if (!wallet) {
      return response.notFound({ message: `No wallet found for currency ${params.currency}` })
    }

    const flagUrl = await safeFlagForCurrency(wallet.currencyCode)

    return response.ok({
      data: {
        id: wallet.id,
        currency_code: wallet.currencyCode,
        flag_url: flagUrl,
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
