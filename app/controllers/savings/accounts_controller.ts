import type { HttpContext } from '@adonisjs/core/http'
import type User from '#models/user'
import SavingsAccount from '#models/savings_account'
import { PinService } from '#services/security/pin_service'
import { SavingsService } from '#services/savings/savings_service'
import {
  openSavingsValidator,
  savingsMovementValidator,
  closeSavingsValidator,
} from '#validators/savings'

/**
 * Someone managing their own savings from the app.
 *
 * Every route resolves the account by id AND by the signed-in user, so an id belonging to somebody
 * else simply does not exist here — a 404 rather than a 403, since whether that account exists is
 * not this caller's business.
 */
export default class SavingsAccountsController {
  /** GET /api/v1/finance/savings */
  async index({ auth, response }: HttpContext) {
    const user = auth.user as User

    const accounts = await SavingsAccount.query()
      .where('user_id', user.id)
      .preload('product')
      .preload('provider')
      .preload('wallet')
      .orderBy('opened_at', 'desc')

    return response.ok({ data: accounts.map((account) => this.serialize(account)) })
  }

  /** GET /api/v1/finance/savings/:id */
  async show({ auth, params, response }: HttpContext) {
    const account = await this.owned(auth.user as User, params.id)
    if (!account) return response.notFound({ message: 'Savings account not found' })

    return response.ok({ data: this.serialize(account) })
  }

  /** POST /api/v1/finance/savings */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    const payload = await request.validateUsing(openSavingsValidator)

    const pinCheck = await PinService.verifyPin(user, payload.pin)
    if (!pinCheck.valid) {
      return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
    }

    try {
      const account = await SavingsService.open(user.id, payload.product_id, {
        initialAmount: payload.initial_amount ? BigInt(payload.initial_amount) : undefined,
        correlationId,
      })
      await account.load('product')
      await account.load('provider')
      await account.load('wallet')

      return response.created({ data: this.serialize(account) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/finance/savings/:id/deposit */
  async deposit({ auth, params, request, correlationId, response }: HttpContext) {
    return this.movement(auth.user as User, params.id, request, correlationId, response, 'deposit')
  }

  /** POST /api/v1/finance/savings/:id/withdraw */
  async withdraw({ auth, params, request, correlationId, response }: HttpContext) {
    return this.movement(auth.user as User, params.id, request, correlationId, response, 'withdraw')
  }

  /** POST /api/v1/finance/savings/:id/close */
  async close({ auth, params, request, correlationId, response }: HttpContext) {
    const user = auth.user as User
    const payload = await request.validateUsing(closeSavingsValidator)

    const account = await this.owned(user, params.id)
    if (!account) return response.notFound({ message: 'Savings account not found' })

    const pinCheck = await PinService.verifyPin(user, payload.pin)
    if (!pinCheck.valid) {
      return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
    }

    try {
      await SavingsService.close(account, correlationId)
      await account.load('wallet')
      return response.ok({ data: this.serialize(account) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private async movement(
    user: User,
    id: string,
    request: HttpContext['request'],
    correlationId: string,
    response: HttpContext['response'],
    kind: 'deposit' | 'withdraw'
  ) {
    const payload = await request.validateUsing(savingsMovementValidator)

    const account = await this.owned(user, id)
    if (!account) return response.notFound({ message: 'Savings account not found' })

    const pinCheck = await PinService.verifyPin(user, payload.pin)
    if (!pinCheck.valid) {
      return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
    }

    try {
      const amount = BigInt(payload.amount)
      if (kind === 'deposit') {
        await SavingsService.deposit(account, amount, correlationId)
      } else {
        await SavingsService.withdraw(account, amount, correlationId)
      }
      await account.load('wallet')
      return response.ok({ data: this.serialize(account) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private owned(user: User, id: string) {
    return SavingsAccount.query()
      .where('id', Number(id))
      .where('user_id', user.id)
      .preload('product')
      .preload('provider')
      .preload('wallet')
      .first()
  }

  private serialize(account: SavingsAccount) {
    return {
      id: account.id,
      status: account.status,
      currency_code: account.currencyCode,
      balance: account.wallet?.balanceCache.toString() ?? '0',
      withdrawable: account.isWithdrawable,
      opened_at: account.openedAt,
      matures_at: account.maturesAt,
      closed_at: account.closedAt,
      // The rate agreed at opening, which is not necessarily the product's rate today.
      interest_rate_bps: account.interestRateBps,
      interest_rate_percent: account.interestRateBps / 100,
      interest_period: account.interestPeriod,
      product: account.product
        ? { id: account.product.id, name: account.product.name, kind: account.product.kind }
        : null,
      provider: account.provider ? { id: account.provider.id, name: account.provider.name } : null,
    }
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error
    switch (err.name) {
      case 'ProductNotAvailableException':
      case 'AmountOutOfRangeException':
      case 'NoPrimaryWalletException':
        return response.badRequest({ message: err.message })
      case 'AccountNotWithdrawableException':
        return response.conflict({ message: err.message, code: 'E_SAVINGS_LOCKED' })
      default:
        if (err.message?.includes('balance would go negative')) {
          return response.paymentRequired({ message: 'Insufficient balance' })
        }
        throw error
    }
  }
}
