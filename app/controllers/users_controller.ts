import type { HttpContext } from '@adonisjs/core/http'
import KycVerification from '#models/kyc_verification'
import {
  UserAdminService,
  UserNotFoundException,
  WalletNotFoundException,
  WalletStatusException,
} from '#services/users/user_admin_service'
import vine from '@vinejs/vine'
import { CurrencyService } from '#services/money/currency_service'

const freezeWalletValidator = vine.create({ reason: vine.string().minLength(10).maxLength(255) })

/**
 * Admin visibility over regular Users — search/view, plus the wallet freeze/unfreeze controls
 * that were previously entirely absent (see user_admin_service.ts). Users themselves have no
 * account-level status to suspend (unlike Business/Agent/InternalUser) — everything actionable
 * here is at the wallet level.
 */
export default class UsersController {
  /** GET /api/v1/users?search=jane (admin only) */
  async index({ request, response }: HttpContext) {
    const search = request.input('search') as string | undefined
    const users = await UserAdminService.search(search)

    return response.ok({
      data: users.map((u) => ({
        id: u.id,
        code: u.code,
        email: u.email,
        full_name: u.fullName,
        login_attempts: u.loginAttempts,
        login_locked_until: u.loginLockedUntil,
        created_at: u.createdAt,
      })),
    })
  }

  /** GET /api/v1/users/:id (admin only) — profile, wallets, latest KYC status */
  async show({ params, response }: HttpContext) {
    try {
      const user = await UserAdminService.findByIdOrFail(Number(params.id))
      const wallets = await UserAdminService.listWallets(user.id)
      const currencies = await CurrencyService.serializeMany(wallets.map((w) => w.currencyCode))
      const latestKyc = await KycVerification.query()
        .where('subject_type', 'user')
        .where('subject_id', user.id)
        .orderBy('created_at', 'desc')
        .first()

      return response.ok({
        data: {
          id: user.id,
          code: user.code,
          email: user.email,
          full_name: user.fullName,
          login_attempts: user.loginAttempts,
          login_locked_until: user.loginLockedUntil,
          created_at: user.createdAt,
          wallets: wallets.map((w) => ({
            id: w.id,
            currency_code: w.currencyCode,
            logo_url: currencies.get(w.currencyCode)!.logo_url,
            currency: currencies.get(w.currencyCode)!,
            balance: w.balanceCache.toString(),
            status: w.status,
          })),
          kyc: latestKyc
            ? {
                id: latestKyc.id,
                status: latestKyc.status,
                verification_type: latestKyc.verificationType,
                decided_at: latestKyc.decidedAt,
              }
            : null,
        },
      })
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /**
   * POST /api/v1/users/:id/pin/reset (admin only)
   * Fallback for when the self-service email flow (account/pin/reset) is unreachable for this
   * user — clears their PIN so they can set a fresh one via POST /account/pin next time they use
   * the app. See UserAdminService.resetPin() for why this clears rather than assigns one.
   */
  async resetPin({ auth, params, correlationId, response }: HttpContext) {
    const actor = await auth.authenticateUsing(['internal'])

    try {
      await UserAdminService.resetPin(Number(params.id), actor.id, correlationId)
      return response.ok({ message: 'PIN cleared — user must set a new one via POST /account/pin' })
    } catch (error) {
      if (error instanceof UserNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/users/:id/wallets/:walletId/freeze (admin only) */
  async freezeWallet({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = await auth.authenticateUsing(['internal'])
    const { reason } = await request.validateUsing(freezeWalletValidator)

    try {
      const wallet = await UserAdminService.freezeWallet(
        Number(params.id),
        Number(params.walletId),
        reason,
        actor.id,
        correlationId
      )
      return response.ok({ data: { id: wallet.id, status: wallet.status } })
    } catch (error) {
      if (error instanceof WalletNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof WalletStatusException) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/users/:id/wallets/:walletId/unfreeze (admin only) */
  async unfreezeWallet({ auth, params, correlationId, response }: HttpContext) {
    const actor = await auth.authenticateUsing(['internal'])

    try {
      const wallet = await UserAdminService.unfreezeWallet(
        Number(params.id),
        Number(params.walletId),
        actor.id,
        correlationId
      )
      return response.ok({ data: { id: wallet.id, status: wallet.status } })
    } catch (error) {
      if (error instanceof WalletNotFoundException) {
        return response.notFound({ message: error.message })
      }
      if (error instanceof WalletStatusException) {
        return response.badRequest({ message: error.message })
      }
      throw error
    }
  }
}
