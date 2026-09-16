import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { FloatTransferService } from '#services/transactions/float_transfer_service'
import Agent from '#models/agent'

const floatTransferValidator = vine.create({
  to_agent_id: vine.number().positive(),
  amount: vine.string().regex(/^[1-9]\d*$/), // smallest-unit, no zero, no leading zeros
  currency_code: vine.string().fixedLength(3).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

const floatConvertValidator = vine.create({
  amount: vine.string().regex(/^[1-9]\d*$/),
  currency_code: vine.string().fixedLength(3).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

const FLOAT_TRANSFER_ENDPOINT = 'POST /api/v1/agents/float-transfer'
const FLOAT_CONVERT_ENDPOINT = 'POST /api/v1/agents/float-convert'

/**
 * Self-service float operations for the authenticated agent (resolved via AgentIdentityService,
 * same pattern as cash_in/cash_out controllers) — wires up FloatTransferService, which existed
 * but had no route before. Both actions move real money, so both require the caller's PIN and an
 * idempotency key, same convention as cash-in/cash-out/card topup.
 */
export default class AgentFloatController {
  /**
   * POST /api/v1/agents/float-transfer — push float down to a direct child agent. Only the
   * child's actual parent may do this (enforced here; FloatTransferService.initiate() itself
   * only checks status/currency/balance, not who is allowed to call it).
   */
  async transfer({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(floatTransferValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: FLOAT_TRANSFER_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException')
        return response.conflict({ message: err.message })
      throw error
    }

    try {
      const fromAgent = await AgentIdentityService.requireActiveAgentForUser(user.id)

      const toAgent = await Agent.find(payload.to_agent_id)
      if (!toAgent) {
        await IdempotencyService.fail(identity)
        return response.notFound({ message: `Agent ${payload.to_agent_id} not found` })
      }
      if (toAgent.parentAgentId !== fromAgent.id) {
        await IdempotencyService.fail(identity)
        return response.forbidden({
          message: 'You may only send float to your own direct sub-agents',
        })
      }

      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const txn = await FloatTransferService.initiate({
        fromAgentId: fromAgent.id,
        toAgentId: toAgent.id,
        amount: new Money(BigInt(payload.amount), currencyCode),
        correlationId,
      })

      const body = {
        data: { transaction_id: txn.id, status: txn.status, created_at: txn.createdAt },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'AgentNotFoundException' || err.name === 'AgentNotActiveException') {
        return response.forbidden({ message: err.message })
      }
      return response.badRequest({ message: err.message || 'Float transfer failed' })
    }
  }

  /**
   * POST /api/v1/agents/float-convert — agent moves money from their own personal wallet into
   * their own float wallet. No hierarchy check needed (same owner on both sides).
   */
  async convert({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(floatConvertValidator)
    const currencyCode = payload.currency_code || 'USD'

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: FLOAT_CONVERT_ENDPOINT,
    }

    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload(payload),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      const err = error as any
      if (err.name === 'IdempotencyConflictException')
        return response.conflict({ message: err.message })
      throw error
    }

    try {
      const agent = await AgentIdentityService.requireActiveAgentForUser(user.id)

      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const txn = await FloatTransferService.convertFromPersonalWallet({
        agentId: agent.id,
        amount: new Money(BigInt(payload.amount), currencyCode),
        correlationId,
      })

      const body = {
        data: { transaction_id: txn.id, status: txn.status, created_at: txn.createdAt },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (err.name === 'AgentNotFoundException' || err.name === 'AgentNotActiveException') {
        return response.forbidden({ message: err.message })
      }
      return response.badRequest({ message: err.message || 'Float conversion failed' })
    }
  }
}
