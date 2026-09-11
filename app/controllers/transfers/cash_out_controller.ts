import type { HttpContext } from '@adonisjs/core/http'
import { CashOutService } from '#services/transactions/cash_out_service'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import Wallet from '#models/wallet'
import Agent from '#models/agent'
import vine from '@vinejs/vine'

const createCashOutValidator = vine.create({
  agent_code: vine.string().regex(/^\d{9}$/), // 9-digit phone-like code
  amount: vine.string().regex(/^[1-9]\d*$/), // no zero, no leading zeros
  currency_code: vine.string().fixedLength(3),
  pin: vine.string().regex(/^\d{4}$/), // PIN required: exactly 4 digits
  idempotency_key: vine.string().uuid(),
})

const CASH_OUT_ENDPOINT = 'POST /api/v1/cash-out'

export default class CashOutController {
  /**
   * POST /api/v1/cash-out
   * User initiates cash-out withdrawal via agent
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCashOutValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: CASH_OUT_ENDPOINT,
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

    const userWallet = await Wallet.query()
      .where('user_id', user.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()

    if (!userWallet) {
      await IdempotencyService.fail(identity)
      return response.notFound({
        message: `Active wallet not found for currency ${currencyCode}`,
      })
    }

    try {
      // Verify PIN first
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      // Find agent by code
      const agent = await Agent.query().where('code', payload.agent_code).first()

      if (!agent) {
        await IdempotencyService.fail(identity)
        return response.notFound({
          message: `Agent with code ${payload.agent_code} not found`,
        })
      }

      if (agent.status !== 'active') {
        await IdempotencyService.fail(identity)
        return response.badRequest({
          message: `Agent ${payload.agent_code} is not active`,
        })
      }

      const amount = new Money(BigInt(payload.amount), currencyCode)
      const correlationId = (request as any).correlationId || 'unknown'
      const txn = await CashOutService.initiate({
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
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'InsufficientBalanceException') {
        return response.paymentRequired({ message: err.message })
      }
      if (err.name === 'TransactionLimitExceededException') {
        return response.badRequest({ message: err.message })
      }
      if (err.name === 'ValidationException') {
        return response.unprocessableEntity({ message: err.message })
      }
      return response.internalServerError({ message: 'Cash-out failed' })
    }
  }

  /**
   * POST /api/v1/cash-out/:transaction_id/confirm
   * Agent confirms they paid out the cash — only the assigned agent may confirm.
   */
  async confirm({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const agent = await AgentIdentityService.requireActiveAgentForUser(user.id)
      const correlationId = (request as any).correlationId || 'unknown'
      const txn = await CashOutService.confirm(params.transaction_id, correlationId, agent.id)

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
        err.name === 'CashOutOwnershipException'
      ) {
        return response.forbidden({ message: err.message })
      }
      return response.internalServerError({ message: err.message || 'Confirm failed' })
    }
  }

  /**
   * POST /api/v1/cash-out/:transaction_id/pickup
   * User confirms they picked up the cash — only the user who requested it may confirm.
   */
  async pickup({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const txn = await CashOutService.confirmPickup(params.transaction_id, user.id)

      return response.ok({
        data: {
          transaction_id: txn.id,
          status: txn.status,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'CashOutOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      return response.internalServerError({ message: err.message || 'Pickup confirmation failed' })
    }
  }

  /**
   * POST /api/v1/cash-out/:transaction_id/cancel
   * Cancel cash-out request — only the user who requested it may cancel.
   */
  async cancel({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const txn = await CashOutService.cancel(params.transaction_id, user.id)

      return response.ok({
        data: {
          transaction_id: txn.id,
          status: txn.status,
          completed_at: txn.completedAt,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'CashOutOwnershipException') {
        return response.forbidden({ message: err.message })
      }
      return response.internalServerError({ message: err.message || 'Cancellation failed' })
    }
  }
}
