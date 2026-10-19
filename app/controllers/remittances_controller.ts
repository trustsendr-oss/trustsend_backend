import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import Remittance from '#models/remittance'
import type User from '#models/user'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { RemittancePresenter } from '#services/remittances/remittance_presenter'
import {
  CASH_PAYOUT_CURRENCIES,
  MOBILE_MONEY_PAYOUT_CURRENCIES,
  PAYOUT_COUNTRY,
  REMITTANCE_QUOTE_TTL_MINUTES,
  REMITTANCE_TTL_DAYS,
  RemittanceService,
  WALLET_PAYOUT_CURRENCIES,
} from '#services/remittances/remittance_service'
import { PinService } from '#services/security/pin_service'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'

const provider = new PawaPayProvider()

const quoteValidator = vine.create({
  source_currency: vine.string().fixedLength(3),
  payout_currency: vine.string().fixedLength(3),
  payout_method: vine.enum(['cash_pickup', 'wallet', 'mobile_money']),
  send_amount: vine.string().regex(/^[1-9]\d*$/),
  /** Mobile money only: the PawaPay operator code, e.g. VODACOM_MPESA_COD. */
  provider_code: vine.string().trim().maxLength(60).optional(),
})

const sendValidator = vine.create({
  quote_id: vine.string().maxLength(40),
  sender_country: vine.string().regex(/^[A-Za-z]{2}$/),
  payout_method: vine.enum(['cash_pickup', 'wallet', 'mobile_money']),
  beneficiary_name: vine.string().trim().minLength(3).maxLength(120),
  beneficiary_phone: vine.string().trim().minLength(9).maxLength(20),
  beneficiary_city: vine.string().trim().maxLength(80).optional(),
  beneficiary_code: vine
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  purpose: vine.string().trim().maxLength(120).optional(),
  pin: vine.string().regex(/^\d{4}$/),
  idempotency_key: vine.string().uuid(),
})

/** Maps service refusals to their status and code; anything else is a real fault. */
export function remittanceErrorResponse(error: unknown, response: HttpContext['response']) {
  const err = error as Error & { code?: string; status?: number }
  if (err.name === 'RemittanceException') {
    return response.status(err.status ?? 422).send({ message: err.message, code: err.code })
  }
  if (err.name === 'AgentLimitExceededException') {
    return response.unprocessableEntity({ message: err.message, code: 'AGENT_LIMIT_EXCEEDED' })
  }
  if (
    err.name === 'TransactionLimitExceededException' ||
    err.name === 'FundsReservedException' ||
    err.name === 'CurrencyNotSupportedException' ||
    err.name === 'ExchangeRateUnavailableException'
  ) {
    return response.unprocessableEntity({
      message: err.message,
      code: err.name === 'FundsReservedException' ? 'FUNDS_RESERVED' : undefined,
    })
  }
  throw error
}

/**
 * International transfers into the DRC, sender side. See RemittanceService for the money path.
 */
export default class RemittancesController {
  /** GET /api/v1/remittances/corridor — what the app needs to build the form. */
  async corridor({ response }: HttpContext) {
    return response.ok({
      data: {
        payout_country: PAYOUT_COUNTRY,
        cash_payout_currencies: CASH_PAYOUT_CURRENCIES,
        wallet_payout_currencies: WALLET_PAYOUT_CURRENCIES,
        mobile_money_payout_currencies: MOBILE_MONEY_PAYOUT_CURRENCIES,
        fee_percent: await FeeScheduleService.getFeePercent('remittance'),
        quote_ttl_minutes: REMITTANCE_QUOTE_TTL_MINUTES,
        pickup_ttl_days: REMITTANCE_TTL_DAYS,
      },
    })
  }

  /** POST /api/v1/remittances/quote */
  async quote({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(quoteValidator)
    try {
      const quote = await RemittanceService.quote(
        user,
        {
          sourceCurrency: payload.source_currency,
          payoutCurrency: payload.payout_currency,
          payoutMethod: payload.payout_method,
          sendAmount: BigInt(payload.send_amount),
          providerCode: payload.provider_code,
        },
        provider
      )
      return response.created({
        data: {
          quote_id: quote.id,
          source_currency: quote.sourceCurrency,
          send_amount: quote.sendAmount.toString(),
          fee: quote.fee.toString(),
          total_debited: (quote.sendAmount + quote.fee).toString(),
          payout_currency: quote.payoutCurrency,
          payout_amount: quote.payoutAmount.toString(),
          rate: quote.rate,
          expires_at: quote.expiresAt,
        },
      })
    } catch (error) {
      return remittanceErrorResponse(error, response)
    }
  }

  /** POST /api/v1/remittances — PIN-authorised, idempotent on `idempotency_key`. */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(sendValidator)

    const pin = await PinService.verifyPin(user, payload.pin)
    if (!pin.valid) return response.unauthorized({ message: pin.message, code: pin.code })

    try {
      const { remittance, replayed } = await RemittanceService.send(
        user,
        {
          quoteId: payload.quote_id,
          senderCountry: payload.sender_country,
          payoutMethod: payload.payout_method,
          beneficiaryName: payload.beneficiary_name,
          beneficiaryPhone: payload.beneficiary_phone,
          beneficiaryCity: payload.beneficiary_city,
          beneficiaryCode: payload.beneficiary_code,
          purpose: payload.purpose,
          idempotencyKey: payload.idempotency_key,
          correlationId,
        },
        provider
      )
      const body = { data: RemittancePresenter.forSender(remittance) }
      return replayed ? response.ok(body) : response.created(body)
    } catch (error) {
      return remittanceErrorResponse(error, response)
    }
  }

  /** GET /api/v1/remittances — the sender's own transfers, newest first. */
  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const rows = await Remittance.query()
      .where('sender_user_id', user.id)
      .orderBy('created_at', 'desc')
      .limit(50)
    return response.ok({ data: rows.map((r) => RemittancePresenter.forSender(r)) })
  }

  /** GET /api/v1/remittances/:id */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const remittance = await Remittance.find(params.id)
    if (!remittance || remittance.senderUserId !== user.id) {
      return response.notFound({ message: 'Transfer not found', code: 'REMITTANCE_NOT_FOUND' })
    }
    return response.ok({ data: RemittancePresenter.forSender(remittance) })
  }

  /** POST /api/v1/remittances/:id/cancel — full refund while not yet paid out. */
  async cancel({ auth, params, correlationId, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const remittance = await RemittanceService.cancelBySender(user, params.id, correlationId)
      return response.ok({ data: RemittancePresenter.forSender(remittance) })
    } catch (error) {
      return remittanceErrorResponse(error, response)
    }
  }
}
