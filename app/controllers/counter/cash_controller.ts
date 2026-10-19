import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Wallet from '#models/wallet'
import { CashInService } from '#services/transactions/cash_in_service'
import { CashOutService } from '#services/transactions/cash_out_service'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { BusinessStaffIdentityService } from '#services/business/business_staff_identity_service'
import {
  counterCashInValidator,
  counterCashOutValidator,
  counterConfirmValidator,
  counterCancelValidator,
} from '#validators/counter_cash'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { InstitutionJournalService } from '#services/counter/institution_journal_service'

/**
 * Cash over an institution's counter.
 *
 * The existing /cash-in and /cash-out routes resolve the agent from `agents.user_id`, which a
 * counter does not have: a counter is a place, and the person at it is a business_staff posting.
 * These routes resolve it from that posting instead. They also credit and debit the CUSTOMER, not
 * the caller — /cash-in credits the caller's own wallet, which is right for a network agent
 * topping themselves up and wrong for a window serving the public.
 *
 * ## Which PIN authorises what
 *
 * This is the part worth reading twice, and it is deliberately asymmetric.
 *
 * A deposit only ever credits the customer and debits the institution's float. Nobody's money is
 * at risk but the institution's, so the TELLER's PIN authorises it — and the customer, who may
 * have walked in with no phone at all, is not asked for anything.
 *
 * A withdrawal debits the customer. Letting a teller's PIN authorise that would hand every teller
 * the ability to empty any account they can name, so the CUSTOMER's PIN is required and the
 * teller's will not do. The customer enters it at the window, the way they would on a card
 * terminal. The teller then confirms with their own PIN when the notes actually leave the drawer,
 * which is a second, separate act.
 */
export default class CounterCashController {
  /**
   * POST /api/v1/counter/cash-in — a customer hands notes over the counter.
   */
  async cashIn({ auth, businessStaff, request, correlationId, response }: HttpContext) {
    const teller = auth.user as User
    const payload = await request.validateUsing(counterCashInValidator)
    const currencyCode = payload.currency_code.toUpperCase()

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: teller.id,
      endpoint: 'POST /api/v1/counter/cash-in',
    }

    const begun = await this.begin(identity, payload, response)
    if (begun !== true) return begun

    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const customerWallet = await this.resolveCustomerWallet(payload.customer_code, currencyCode)
      if (!customerWallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `No active ${currencyCode} wallet for customer ${payload.customer_code}`,
        })
      }

      const pinCheck = await PinService.verifyPin(teller, payload.teller_pin)
      if (!pinCheck.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

      const txn = await CashInService.initiate({
        agentId: counter.id,
        userWalletId: customerWallet.id,
        amount: new Money(BigInt(payload.amount), currencyCode),
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          transaction_id: txn.id,
          status: txn.status,
          teller_session_id: txn.tellerSessionId,
          created_at: txn.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handle(error, response)
    }
  }

  /**
   * POST /api/v1/counter/cash-in/:transaction_id/confirm — the notes are in the drawer.
   */
  async confirmCashIn({
    auth,
    businessStaff,
    params,
    request,
    correlationId,
    response,
  }: HttpContext) {
    const teller = auth.user as User
    const payload = await request.validateUsing(counterConfirmValidator)

    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const pinCheck = await PinService.verifyPin(teller, payload.teller_pin)
      if (!pinCheck.valid) {
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

      const txn = await CashInService.confirm(params.transaction_id, correlationId, counter.id)
      return response.ok({
        data: { transaction_id: txn.id, status: txn.status, completed_at: txn.completedAt },
      })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/counter/cash-in/:transaction_id/reject — the notes never arrived. */
  async rejectCashIn({ businessStaff, params, response }: HttpContext) {
    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)
      const txn = await CashInService.reject(params.transaction_id, counter.id)
      return response.ok({ data: { transaction_id: txn.id, status: txn.status } })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /**
   * POST /api/v1/counter/cash-out — a customer withdraws at the counter.
   *
   * Takes the CUSTOMER's PIN. A teller's PIN here would let any teller empty any account they can
   * name, which is why the customer enters theirs at the window.
   */
  async cashOut({ auth, businessStaff, request, correlationId, response }: HttpContext) {
    const teller = auth.user as User
    const payload = await request.validateUsing(counterCashOutValidator)
    const currencyCode = payload.currency_code.toUpperCase()

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: teller.id,
      endpoint: 'POST /api/v1/counter/cash-out',
    }

    const begun = await this.begin(identity, payload, response)
    if (begun !== true) return begun

    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const customer = await User.findBy('code', payload.customer_code)
      if (!customer) {
        await IdempotencyService.fail(identity)
        return response.notFound({ message: `No customer with code ${payload.customer_code}` })
      }

      const customerWallet = await this.resolveCustomerWallet(payload.customer_code, currencyCode)
      if (!customerWallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `No active ${currencyCode} wallet for customer ${payload.customer_code}`,
        })
      }

      // The account holder's own PIN, never the teller's.
      const pinCheck = await PinService.verifyPin(customer, payload.customer_pin)
      if (!pinCheck.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

      const txn = await CashOutService.initiate({
        agentId: counter.id,
        userWalletId: customerWallet.id,
        amount: new Money(BigInt(payload.amount), currencyCode),
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          transaction_id: txn.id,
          status: txn.status,
          teller_session_id: txn.tellerSessionId,
          created_at: txn.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      return this.handle(error, response)
    }
  }

  /**
   * POST /api/v1/counter/cash-out/:transaction_id/confirm — the notes have left the drawer.
   *
   * A second, separate act from the customer's authorisation: the teller states that the money
   * was actually handed over, and their PIN is what says so.
   */
  async confirmCashOut({
    auth,
    businessStaff,
    params,
    request,
    correlationId,
    response,
  }: HttpContext) {
    const teller = auth.user as User
    const payload = await request.validateUsing(counterConfirmValidator)

    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)

      const pinCheck = await PinService.verifyPin(teller, payload.teller_pin)
      if (!pinCheck.valid) {
        return response.unauthorized({ message: pinCheck.message, code: pinCheck.code })
      }

      const txn = await CashOutService.confirm(params.transaction_id, correlationId, counter.id)
      return response.ok({
        data: { transaction_id: txn.id, status: txn.status, completed_at: txn.completedAt },
      })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /**
   * GET /api/v1/counter/cash/pending — operations on this teller's open shift still awaiting
   * their second act. Without it, an operation initiated before a page reload is invisible, yet
   * still blocks the close.
   */
  async pending({ businessStaff, response }: HttpContext) {
    if (!businessStaff.agentId) {
      return response.ok({ data: [] })
    }
    const session = await TellerSessionService.openSessionFor(businessStaff.agentId)
    if (!session) {
      return response.ok({ data: [] })
    }

    const rows = await TellerSessionService.pendingOperationsQuery(session.id)
    return response.ok({ data: await InstitutionJournalService.serialize(rows) })
  }

  /**
   * POST /api/v1/counter/cash-out/:transaction_id/cancel — the notes never left the drawer.
   *
   * Nothing was debited at initiation, so cancelling moves no money; it only releases the line.
   * No PIN: it can only ever stop money from moving, never make it move.
   */
  async cancelCashOut({ businessStaff, params, request, response }: HttpContext) {
    const payload = await request.validateUsing(counterCancelValidator)
    try {
      const counter = await BusinessStaffIdentityService.requireCounterForStaff(businessStaff)
      const txn = await CashOutService.cancelAtCounter(
        params.transaction_id,
        counter.id,
        payload.reason
      )
      return response.ok({ data: { transaction_id: txn.id, status: txn.status } })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** The customer's spendable wallet — never a savings escrow, hence the primary scope. */
  private async resolveCustomerWallet(customerCode: string, currencyCode: string) {
    const customer = await User.findBy('code', customerCode)
    if (!customer) return null

    return Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', customer.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()
  }

  private async begin(
    identity: { key: string; actorType: 'user'; actorId: number; endpoint: string },
    payload: unknown,
    response: HttpContext['response']
  ) {
    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload as Record<string, unknown>),
      })
      if (outcome.replay) {
        return response.status(outcome.status).send(outcome.body)
      }
      return true as const
    } catch (error) {
      const err = error as Error
      if (err.name === 'IdempotencyConflictException') {
        return response.conflict({ message: err.message })
      }
      throw error
    }
  }

  private handle(error: unknown, response: HttpContext['response']) {
    const err = error as Error & { code?: string }
    if (err.code === 'E_ROW_NOT_FOUND') {
      return response.notFound({ message: 'Transaction not found' })
    }
    switch (err.name) {
      case 'StaffNotPostedException':
      case 'CounterNotActiveException':
      case 'CashInOwnershipException':
      case 'CashOutOwnershipException':
        return response.forbidden({ message: err.message })
      case 'NoOpenSessionException':
        return response.conflict({ message: err.message, code: 'E_NO_OPEN_SESSION' })
      case 'InsufficientFloatException':
      case 'InsufficientBalanceException':
        return response.paymentRequired({ message: err.message })
      case 'FundsReservedException':
        return response.paymentRequired({ message: err.message, code: 'FUNDS_RESERVED' })
      case 'CashOutExpiredException':
        return response.gone({ message: err.message, code: 'CASH_OUT_EXPIRED' })
      case 'TransactionLimitExceededException':
        return response.unprocessableEntity({ message: err.message })
      case 'AgentLimitExceededException':
        return response.unprocessableEntity({ message: err.message, code: 'AGENT_LIMIT_EXCEEDED' })
      default:
        // The services signal a wrong state with a plain Error ("must be in … status"): that is
        // the caller acting on a stale screen, not a server fault.
        if (/must be in \w+ status/.test(err.message ?? '')) {
          return response.conflict({ message: err.message, code: 'E_TRANSACTION_STATE' })
        }
        return response.internalServerError({ message: err.message || 'Counter operation failed' })
    }
  }
}
