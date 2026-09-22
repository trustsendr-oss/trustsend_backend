import type { HttpContext } from '@adonisjs/core/http'
import FinancialProduct from '#models/financial_product'
import SavingsAccount from '#models/savings_account'
import User from '#models/user'
import { BusinessStaffIdentityService } from '#services/business/business_staff_identity_service'
import { PinService } from '#services/security/pin_service'
import { SavingsService } from '#services/savings/savings_service'
import {
  counterOpenSavingsValidator,
  counterSavingsMovementValidator,
  counterSavingsLookupValidator,
} from '#validators/counter_savings'

/**
 * Savings handled across the counter, for a customer with no smartphone.
 *
 * ## No drawer is involved
 *
 * These movements go between two wallets the customer already owns; no notes cross the counter, so
 * nothing here books to a teller session and no open session is required. Booking them would be
 * actively wrong — the shift's expected cash would move while the drawer did not, manufacturing a
 * variance out of nothing.
 *
 * Someone arriving with banknotes to save does two things: a cash-in, which puts the notes in the
 * drawer and books to the shift, and then a savings deposit, which does not. The drawer still
 * counts.
 *
 * ## Whose money, whose PIN
 *
 * The customer's, in every direction. A teller may not lock a customer's balance away any more
 * than they may release it.
 *
 * ## Whose institution
 *
 * A teller acts only for the institution that employs them: they may open an account on their own
 * institution's products, and touch only accounts held with it. Anything else would let one
 * institution's staff operate a competitor's book.
 */
export default class CounterSavingsController {
  /** GET /api/v1/counter/savings?customer_code=123456789 */
  async index({ business, request, response }: HttpContext) {
    const { customer_code: code } = await request.validateUsing(counterSavingsLookupValidator, {
      data: request.qs(),
    })

    const customer = await User.findBy('code', code)
    if (!customer) {
      return response.notFound({ message: 'No customer with this code' })
    }

    const accounts = await SavingsAccount.query()
      .where('user_id', customer.id)
      .where('provider_id', business.id)
      .preload('product')
      .preload('wallet')
      .orderBy('opened_at', 'desc')

    return response.ok({
      data: accounts.map((account) => this.serialize(account)),
    })
  }

  /** POST /api/v1/counter/savings */
  async store({ business, businessStaff, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(counterOpenSavingsValidator)

    try {
      await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const product = await FinancialProduct.find(payload.product_id)
      if (!product || product.providerId !== business.id) {
        // Not a 403: which products another institution sells is not this caller's business.
        return response.notFound({ message: 'No such product at this institution' })
      }

      const customer = await User.findBy('code', payload.customer_code)
      if (!customer) {
        return response.notFound({ message: 'No customer with this code' })
      }

      const pinCheck = await PinService.verifyPin(customer, payload.customer_pin)
      if (!pinCheck.valid) {
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

      const account = await SavingsService.open(customer.id, product.id, {
        initialAmount: payload.initial_amount ? BigInt(payload.initial_amount) : undefined,
        correlationId,
      })
      await account.load('product')
      await account.load('wallet')

      return response.created({ data: this.serialize(account) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/savings/:id/deposit */
  async deposit(ctx: HttpContext) {
    return this.movement(ctx, 'deposit')
  }

  /** POST /api/v1/counter/savings/:id/withdraw */
  async withdraw(ctx: HttpContext) {
    return this.movement(ctx, 'withdraw')
  }

  private async movement(
    { business, businessStaff, params, request, correlationId, response }: HttpContext,
    kind: 'deposit' | 'withdraw'
  ) {
    const payload = await request.validateUsing(counterSavingsMovementValidator)

    try {
      await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      // Scoped by the institution as well as the id: an account held with a competitor does not
      // exist as far as this window is concerned.
      const account = await SavingsAccount.query()
        .where('id', Number(params.id))
        .where('provider_id', business.id)
        .preload('product')
        .preload('wallet')
        .first()

      if (!account) {
        return response.notFound({ message: 'Savings account not found' })
      }

      const customer = await User.findOrFail(account.userId)
      const pinCheck = await PinService.verifyPin(customer, payload.customer_pin)
      if (!pinCheck.valid) {
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

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

  private serialize(account: SavingsAccount) {
    return {
      id: account.id,
      status: account.status,
      currency_code: account.currencyCode,
      balance: account.wallet?.balanceCache.toString() ?? '0',
      withdrawable: account.isWithdrawable,
      opened_at: account.openedAt,
      matures_at: account.maturesAt,
      interest_rate_percent: account.interestRateBps / 100,
      interest_period: account.interestPeriod,
      product: account.product
        ? { id: account.product.id, name: account.product.name, kind: account.product.kind }
        : null,
    }
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error
    switch (err.name) {
      case 'StaffNotPostedException':
      case 'CounterNotActiveException':
        return response.forbidden({ message: err.message })
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
