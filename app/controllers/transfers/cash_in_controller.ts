import type { HttpContext } from '@adonisjs/core/http'
import { CashInService } from '#services/transactions/cash_in_service'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import Wallet from '#models/wallet'
import User from '#models/user'
import vine from '@vinejs/vine'

const createCashInValidator = vine.create({
  // The customer being credited, by the 9-digit code they share — the same exact-match identifier
  // DirectoryController and the institution counters use. Without it the endpoint could only
  // ever credit the signed-in agent's own wallet.
  customer_code: vine.string().regex(/^\d{9}$/),
  amount: vine.string().regex(/^[1-9]\d*$/), // no zero, no leading zeros
  currency_code: vine.string().fixedLength(3),
  pin: vine.string().regex(/^\d{4}$/), // PIN required: exactly 4 digits
  idempotency_key: vine.string().uuid(),
})

const CASH_IN_ENDPOINT = 'POST /api/v1/cash-in'

export default class CashInController {
  /**
   * POST /api/v1/cash-in
   * Agent initiates a cash deposit into the wallet of the customer named by `customer_code`
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCashInValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: CASH_IN_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) {
        return response.status(outcome.status).send(outcome.body)
      }
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException') {
        return response.conflict({ message: err.message })
      }
      throw error
    }

    try {
      // Verify the authenticated caller is actually a registered, active agent — without this
      // check any authenticated user could credit their own wallet with no real deposit.
      const agent = await AgentIdentityService.requireActiveAgentForUser(user.id)

      const customer = await User.findBy('code', payload.customer_code)
      if (!customer) {
        await IdempotencyService.fail(identity)
        return response.notFound({ message: 'No account matches this customer code' })
      }

      // An agent crediting their own personal wallet from their float moves platform float into
      // spendable money with no cash deposited by anyone: refused outright.
      if (customer.id === user.id) {
        await IdempotencyService.fail(identity)
        return response.unprocessableEntity({
          message: 'An agent cannot make a cash deposit into their own account',
        })
      }

      const userWallet = await Wallet.query()
        .withScopes((s) => s.primary())
        .where('user_id', customer.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()

      if (!userWallet) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `This customer has no active ${currencyCode} wallet`,
        })
      }

      // Verify PIN
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const amount = new Money(BigInt(payload.amount), currencyCode)
      const correlationId = (request as any).correlationId || 'unknown'
      const txn = await CashInService.initiate({
        agentId: agent.id,
        userWalletId: userWallet.id,
        amount,
        correlationId,
        idempotencyKey: payload.idempotency_key,
      })

      const body = {
        data: {
          transaction_id: txn.id,
          status: txn.status,
          created_at: txn.createdAt,
          // Shown back to the agent so they can check the name with the customer at the counter
          // before confirming the deposit.
          customer: {
            code: customer.code,
            full_name: customer.fullName,
          },
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'AgentNotFoundException' || err.name === 'AgentNotActiveException') {
        return response.forbidden({
          message: err.message,
          code: err.name === 'AgentNotActiveException' ? 'AGENT_NOT_ACTIVE' : undefined,
        })
      }
      if (err.name === 'InsufficientFloatException') {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'AgentLimitExceededException') {
        return response.unprocessableEntity({ message: err.message, code: 'AGENT_LIMIT_EXCEEDED' })
      }
      if (err.name === 'ValidationException') {
        return response.unprocessableEntity({ message: err.message })
      }
      return response.internalServerError({ message: 'Cash-in failed' })
    }
  }

  /**
   * POST /api/v1/cash-in/:transaction_id/confirm
   * Confirm cash-in after agent receives physical cash — only the assigned agent may confirm.
   */
  async confirm({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const agent = await AgentIdentityService.requireActiveAgentForUser(user.id)
      const correlationId = (request as any).correlationId || 'unknown'
      const txn = await CashInService.confirm(params.transaction_id, correlationId, agent.id)

      return response.ok({
        data: {
          transaction_id: txn.id,
          status: txn.status,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (
        err.name === 'AgentNotFoundException' ||
        err.name === 'AgentNotActiveException' ||
        err.name === 'CashInOwnershipException'
      ) {
        return response.forbidden({
          message: err.message,
          code: err.name === 'AgentNotActiveException' ? 'AGENT_NOT_ACTIVE' : undefined,
        })
      }
      return response.internalServerError({ message: err.message || 'Confirm failed' })
    }
  }

  /**
   * POST /api/v1/cash-in/:transaction_id/reject
   * Reject cash-in if agent couldn't complete — only the assigned agent may reject.
   */
  async reject({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const agent = await AgentIdentityService.requireActiveAgentForUser(user.id)
      const txn = await CashInService.reject(params.transaction_id, agent.id)

      return response.ok({
        data: {
          transaction_id: txn.id,
          status: txn.status,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (
        err.name === 'AgentNotFoundException' ||
        err.name === 'AgentNotActiveException' ||
        err.name === 'CashInOwnershipException'
      ) {
        return response.forbidden({
          message: err.message,
          code: err.name === 'AgentNotActiveException' ? 'AGENT_NOT_ACTIVE' : undefined,
        })
      }
      return response.internalServerError({ message: err.message || 'Reject failed' })
    }
  }
}
