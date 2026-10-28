import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { GoFreshPayGateway } from '#services/card_payments/gofreshpay_gateway'
import {
  CardDepositException,
  CardDepositService,
} from '#services/card_payments/card_deposit_service'
import { renderCheckoutPage, renderThreeDsReturnPage } from '#services/card_payments/checkout_page'
import { cardDepositResource } from '#controllers/card_payments/card_deposit_resource'
import {
  cardCheckoutChargeValidator,
  cardCheckoutEnrollValidator,
  cardCheckoutSetupValidator,
} from '#validators/card_deposits'

const gateway = new GoFreshPayGateway()

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The checkout page and the calls it makes. Not behind middleware.auth(): the page runs in a
 * browser that has no app session. Each call carries the session's one-time checkout token in
 * `X-Checkout-Token` instead (see CardDepositService.authenticateCheckout), so a session id
 * alone is useless to anyone else.
 */
export default class CardCheckoutController {
  /** GET /card-checkout/:id — the page itself. Holds no data: it fetches it with its token. */
  async page({ params, response }: HttpContext) {
    if (!UUID.test(String(params.id))) return response.notFound('Not found')
    response.header('Cache-Control', 'no-store')
    response.header('Referrer-Policy', 'no-referrer')
    response.header('X-Robots-Tag', 'noindex')
    return response.type('text/html; charset=utf-8').send(
      renderCheckoutPage({
        sessionId: String(params.id),
        returnUrl:
          env.get('CARD_CHECKOUT_RETURN_URL', 'trustsend://card-deposit') ??
          'trustsend://card-deposit',
      })
    )
  }

  /**
   * GET|POST /card-checkout/:id/3ds-return — where the issuer's frame lands after a challenge.
   * Framed by the checkout page, so SAMEORIGIN here where every other page is DENY.
   */
  async threeDsReturn({ params, request, response }: HttpContext) {
    if (UUID.test(String(params.id)) && request.method() === 'POST') {
      await CardDepositService.recordThreeDsReturn(String(params.id), request.all()).catch(() => {})
    }
    response.header('X-Frame-Options', 'SAMEORIGIN')
    response.header('Content-Security-Policy', "frame-ancestors 'self'")
    response.header('Cache-Control', 'no-store')
    return response.type('text/html; charset=utf-8').send(renderThreeDsReturnPage())
  }

  /** GET /api/v1/card-checkout/:id — what the page needs to draw itself. */
  async context(ctx: HttpContext) {
    return this.run(ctx, async (session) => {
      const user = await User.findOrFail(session.userId)
      const kyc = await KycVerification.query()
        .where('subject_type', 'user')
        .where('subject_id', user.id)
        .where('status', 'approved')
        .whereNotNull('country_code')
        .orderBy('decided_at', 'desc')
        .first()
      const open = ['created', 'authenticating', 'challenge'].includes(session.status)
      return {
        ...cardDepositResource(session),
        capture_context: open ? (session.metadata?.capture_context ?? null) : null,
        billing: {
          phone_number: session.metadata?.bill_to?.phoneNumber ?? user.phone ?? null,
          address_country: kyc?.countryCode?.toUpperCase() ?? 'CD',
        },
      }
    })
  }

  /** POST /api/v1/card-checkout/:id/setup — 3DS step 1, after the card fields produced a token. */
  async setup(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(cardCheckoutSetupValidator)
    return this.run(ctx, async (session) => {
      const result = await CardDepositService.setup(gateway, session, payload.transient_token)
      return {
        reference_id: result.referenceId,
        access_token: result.accessToken,
        device_data_collection_url: result.deviceDataCollectionUrl,
      }
    })
  }

  /** POST /api/v1/card-checkout/:id/enroll — 3DS step 2; charges at once when no OTP is asked. */
  async enroll(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(cardCheckoutEnrollValidator)
    return this.run(ctx, async (session) => {
      const result = await CardDepositService.enroll(gateway, session, {
        transientToken: payload.transient_token,
        referenceId: payload.reference_id,
        billing: {
          addressLine1: payload.address_line1,
          addressCity: payload.address_city,
          addressCountry: payload.address_country,
          phoneNumber: payload.phone_number,
        },
      })
      return result.next === 'challenge'
        ? { next: 'challenge', step_up_url: result.stepUpUrl, access_token: result.accessToken }
        : { next: 'done', session: cardDepositResource(result.session) }
    })
  }

  /** POST /api/v1/card-checkout/:id/charge — after the cardholder passed the OTP challenge. */
  async charge(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(cardCheckoutChargeValidator)
    return this.run(ctx, async (session) =>
      cardDepositResource(
        await CardDepositService.charge(gateway, session, payload.transient_token)
      )
    )
  }

  private async run(
    { params, request, response }: HttpContext,
    action: (
      session: Awaited<ReturnType<typeof CardDepositService.authenticateCheckout>>
    ) => Promise<unknown>
  ) {
    response.header('Cache-Control', 'no-store')
    try {
      const session = await CardDepositService.authenticateCheckout(
        String(params.id),
        request.header('x-checkout-token')
      )
      return response.ok({ data: await action(session) })
    } catch (error) {
      if (error instanceof CardDepositException) {
        if (error.code === 'SESSION_NOT_FOUND') return response.notFound({ message: error.message })
        if (error.code === 'GATEWAY_UNAVAILABLE') {
          return response.serviceUnavailable({ message: error.message, code: error.code })
        }
        return response.conflict({ message: error.message, code: error.code })
      }
      throw error
    }
  }
}
