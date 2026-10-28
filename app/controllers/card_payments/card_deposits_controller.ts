import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import { GoFreshPayGateway } from '#services/card_payments/gofreshpay_gateway'
import {
  CardCheckoutUrls,
  CardDepositException,
  CardDepositService,
} from '#services/card_payments/card_deposit_service'
import { cardDepositResource } from '#controllers/card_payments/card_deposit_resource'
import { createCardDepositValidator } from '#validators/card_deposits'

const gateway = new GoFreshPayGateway()

const CARD_DEPOSIT_ENDPOINT = 'POST /api/v1/card-deposits'

export default class CardDepositsController {
  /**
   * POST /api/v1/card-deposits
   * Starts a top-up by bank card. Returns the checkout page to open in an in-app browser; the
   * card is entered there, never in the app.
   */
  async store({ auth, request, response }: HttpContext) {
    // A user token only: staff and business tokens share the guard, never their own top-up.
    const user = auth.user
    if (!(user instanceof User)) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(createCardDepositValidator)
    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: CARD_DEPOSIT_ENDPOINT,
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
      const pinVerification = await PinService.verifyPin(user, payload.pin)
      if (!pinVerification.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({
          message: pinVerification.message,
          code: pinVerification.code,
        })
      }

      const { session, checkoutToken } = await CardDepositService.createSession(gateway, {
        user,
        amount: new Money(BigInt(payload.amount), payload.currency_code),
        correlationId: (request as any).correlationId || 'unknown',
      })

      const body = {
        data: {
          ...cardDepositResource(session),
          // Fragment, not query: the token never reaches a server log or a Referer header.
          checkout_url: `${CardCheckoutUrls.page(session.id)}#t=${checkoutToken}`,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      if (error instanceof CardDepositException) {
        if (error.code === 'GATEWAY_UNAVAILABLE') {
          return response.serviceUnavailable({ message: error.message, code: error.code })
        }
        if (error.code === 'WALLET_UNAVAILABLE') {
          return response.notFound({ message: error.message, code: error.code })
        }
        return response.unprocessableEntity({ message: error.message, code: error.code })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/card-deposits/:id
   * Status of one top-up, for the app's tracking screen (pushed as `card_deposit.updated` too).
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }
    try {
      const session = await CardDepositService.getForUser(String(params.id), user.id)
      return response.ok({ data: cardDepositResource(session) })
    } catch (error) {
      if (error instanceof CardDepositException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
}
