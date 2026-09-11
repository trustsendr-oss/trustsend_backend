import type { HttpContext } from '@adonisjs/core/http'
import Wallet from '#models/wallet'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { WalletStatementService } from '#services/transactions/wallet_statement_service'
import vine from '@vinejs/vine'

const ISO_4217_CODES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL', 'BSD', 'BTC', 'BTN', 'BWP', 'BYN', 'BZD',
  'CAD', 'CDF', 'CHF', 'CLF', 'CLP', 'CNH', 'CNY', 'COP', 'CRC', 'CUC', 'CUP', 'CVE', 'CZK',
  'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR',
  'FJD', 'FKP',
  'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD',
  'HKD', 'HNL', 'HRK', 'HTG', 'HUF',
  'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY',
  'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG',
  'QAR',
  'RON', 'RSD', 'RUB', 'RWF',
  'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLL', 'SOS', 'SRD', 'SSP', 'STN', 'SYP', 'SZL',
  'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS',
  'UAH', 'UGX', 'USD', 'UYU', 'UZS',
  'VEF', 'VES', 'VND', 'VUV',
  'WST',
  'XAF', 'XAG', 'XAU', 'XCD', 'XOF', 'XPD', 'XPF', 'XPT',
  'YER',
  'ZAR', 'ZMW', 'ZWL',
])

const listWalletTransactionsValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  // Filtering has to happen here rather than in the client: a client that hides rows from the
  // page it was given shows "nothing found" while the matching rows sit on page 2.
  direction: vine.enum(['in', 'out']).optional(),
})

const createWalletValidator = vine.create({
  currency_code: vine.string().fixedLength(3).in([...ISO_4217_CODES]),
})

/**
 * Wallets Controller
 *
 * Handles wallet management endpoints
 * - GET /api/v1/wallets - List user's wallets
 * - POST /api/v1/wallets - Create new wallet for different currency
 * - GET /api/v1/wallets/:id - Get wallet details
 */
export default class WalletsController {
  /**
   * GET /api/v1/wallets
   * List all wallets for authenticated user
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const wallets = await Wallet.query()
      .where('user_id', user.id)
      .select('id', 'currency_code', 'balance_cache', 'status', 'created_at', 'updated_at')
      .orderBy('created_at', 'asc')

    return response.ok({
      data: wallets.map((wallet) => ({
        id: wallet.id,
        currency_code: wallet.currencyCode,
        balance: wallet.balanceCache.toString(),
        status: wallet.status,
        created_at: wallet.createdAt,
        updated_at: wallet.updatedAt,
      })),
    })
  }

  /**
   * POST /api/v1/wallets
   * Create a new wallet for authenticated user in a different currency
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createWalletValidator)

    try {
      // Check if wallet already exists for this currency
      const existingWallet = await Wallet.query()
        .where('user_id', user.id)
        .where('currency_code', payload.currency_code)
        .first()

      if (existingWallet) {
        return response.badRequest({
          message: `Wallet for ${payload.currency_code} already exists`,
        })
      }

      // Create new wallet
      const wallet = await UserOnboardingService.createDefaultWallet(
        user.id,
        payload.currency_code,
        (request as any).correlationId || 'unknown'
      )

      return response.created({
        data: {
          id: wallet.id,
          currency_code: wallet.currencyCode,
          balance: wallet.balanceCache.toString(),
          status: wallet.status,
          created_at: wallet.createdAt,
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({
        message: err.message || 'Failed to create wallet',
      })
    }
  }

  /**
   * GET /api/v1/wallets/:id
   * Get details of specific wallet
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const wallet = await Wallet.query()
      .where('id', params.id)
      .where('user_id', user.id)
      .first()

    if (!wallet) {
      return response.notFound({ message: 'Wallet not found' })
    }

    return response.ok({
      data: {
        id: wallet.id,
        currency_code: wallet.currencyCode,
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

  /**
   * GET /api/v1/wallets/:id/transactions
   *
   * Statement for one wallet: every movement that touched it, whatever put it there — P2P,
   * cash-in/out, card funding, mobile money deposit or payout.
   *
   * See WalletStatementService for how the rows are assembled and why.
   */
  async transactions({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const wallet = await Wallet.query().where('id', params.id).where('user_id', user.id).first()

    if (!wallet) {
      return response.notFound({ message: 'Wallet not found' })
    }

    const {
      page = 1,
      limit = 20,
      direction,
    } = await request.validateUsing(listWalletTransactionsValidator)

    const { rows, total } = await WalletStatementService.list({
      walletIds: [wallet.id],
      page,
      limit,
      direction,
    })

    return response.ok({ data: rows, meta: { total, page, limit } })
  }
}
