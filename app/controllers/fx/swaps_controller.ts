import type { HttpContext } from '@adonisjs/core/http'
import { createSwapQuoteValidator, executeSwapValidator } from '#validators/fx'
import { SwapService } from '#services/fx/swap_service'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { swapErrorResponse } from '#controllers/fx/swap_error_response'

const SWAP_ENDPOINT = 'POST /api/v1/swaps'

/** Currency swaps between two wallets of the authenticated user. */
export default class SwapsController {
  /** POST /api/v1/swaps/quote */
  async quote({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(createSwapQuoteValidator)
    try {
      const quote = await SwapService.createQuote(
        { type: 'user', id: user.id },
        {
          fromCurrency: payload.from_currency,
          toCurrency: payload.to_currency,
          amountIn: BigInt(payload.amount),
        }
      )
      return response.created({ data: SwapService.serializeQuote(quote) })
    } catch (error) {
      if (swapErrorResponse(error, response)) return
      throw error
    }
  }

  /** POST /api/v1/swaps */
  async store({ auth, request, response, correlationId }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Unauthenticated' })

    const payload = await request.validateUsing(executeSwapValidator)
    if (!payload.pin) {
      return response.unprocessableEntity({
        errors: [{ field: 'pin', message: 'PIN is required' }],
      })
    }

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: SWAP_ENDPOINT,
    }
    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload({ quote_id: payload.quote_id }),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      if ((error as Error).name === 'IdempotencyConflictException') {
        return response.conflict({ message: (error as Error).message })
      }
      throw error
    }

    try {
      const pinVerification = await PinService.verifyPin(user as any, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const { transaction, quote } = await SwapService.execute(
        { type: 'user', id: user.id },
        { quoteId: payload.quote_id, idempotencyKey: payload.idempotency_key, correlationId }
      )
      const body = { data: SwapService.serializeSwap(transaction, quote) }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      if (swapErrorResponse(error, response)) return
      throw error
    }
  }
}
