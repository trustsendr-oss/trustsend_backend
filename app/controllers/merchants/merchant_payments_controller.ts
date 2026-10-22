import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import type User from '#models/user'
import { Money } from '#services/money/money'
import { PinService } from '#services/security/pin_service'
import { IdempotencyService } from '#services/security/idempotency_service'
import {
  MerchantPaymentException,
  MerchantPaymentService,
} from '#services/merchants/merchant_payment_service'

const MERCHANT_PAYMENT_ENDPOINT = 'POST /api/v1/merchant-payments'

const payValidator = vine.create({
  merchant_code: vine.string().regex(/^\d{6}$/),
  amount: vine.string().regex(/^[1-9]\d*$/),
  currency_code: vine.string().fixedLength(3).toUpperCase(),
  note: vine.string().trim().maxLength(120).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

export default class MerchantPaymentsController {
  /**
   * POST /api/v1/merchant-payments — a customer pays a merchant by its payment code.
   * PIN-authorised and idempotent on `idempotency_key`: a double tap or a retry on a flaky
   * network pays once.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(payValidator)

    const identity = {
      key: payload.idempotency_key,
      actorType: 'user' as const,
      actorId: user.id,
      endpoint: MERCHANT_PAYMENT_ENDPOINT,
    }
    try {
      const outcome = await IdempotencyService.begin({
        ...identity,
        requestHash: IdempotencyService.hashPayload({ ...payload, pin: undefined }),
      })
      if (outcome.replay) return response.status(outcome.status).send(outcome.body)
    } catch (error) {
      if ((error as Error).name === 'IdempotencyConflictException') {
        return response.conflict({ message: (error as Error).message })
      }
      throw error
    }

    try {
      const pin = await PinService.verifyPin(user, payload.pin)
      if (!pin.valid) {
        await IdempotencyService.fail(identity)
        return response.unauthorized({ message: pin.message, code: pin.code })
      }

      const result = await MerchantPaymentService.pay({
        user,
        merchantCode: payload.merchant_code,
        amount: new Money(BigInt(payload.amount), payload.currency_code),
        note: payload.note,
        idempotencyKey: payload.idempotency_key,
        correlationId: (request as any).correlationId || 'unknown',
      })

      const body = {
        data: {
          transaction_id: result.transactionId,
          transaction_uuid: result.transactionUuid,
          merchant: { id: result.businessId, name: result.merchantName },
          amount: result.amount.toString(),
          currency_code: result.currencyCode,
          // What the customer paid on top of the amount: nothing.
          fee: '0',
          created_at: result.createdAt,
        },
      }
      await IdempotencyService.complete(identity, 201, body)
      return response.created(body)
    } catch (error) {
      await IdempotencyService.fail(identity)
      const err = error as any
      if (error instanceof MerchantPaymentException) {
        return response.status(error.status).send({ code: error.code, message: error.message })
      }
      if (err.name === 'FundsReservedException') {
        return response.paymentRequired({ code: 'FUNDS_RESERVED', message: err.message })
      }
      if (
        err.name === 'LimitExceededException' ||
        err.name === 'TransactionLimitExceededException'
      ) {
        return response.badRequest({ code: 'LIMIT_EXCEEDED', message: err.message })
      }
      throw error
    }
  }
}
