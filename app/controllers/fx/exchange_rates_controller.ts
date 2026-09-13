import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'
import { listExchangeRatesValidator, updateExchangeRateValidator } from '#validators/fx'
import {
  ExchangeRateService,
  ExchangeRateUnavailableException,
  ExchangeRateFeedException,
  BaseCurrencyRateException,
  CurrencyNotFoundException,
} from '#services/fx/exchange_rate_service'

export default class ExchangeRatesController {
  /** GET /api/v1/exchange-rates?base=USD — public mid rates, no margin */
  async index({ request, response }: HttpContext) {
    const { base } = await request.validateUsing(listExchangeRatesValidator, { data: request.qs() })
    try {
      return response.ok(await ExchangeRateService.listPublic(base))
    } catch (error) {
      if (error instanceof ExchangeRateUnavailableException) {
        return response.unprocessableEntity({ message: error.message })
      }
      throw error
    }
  }

  /** GET /api/v1/admin/exchange-rates */
  async adminIndex({ response }: HttpContext) {
    return response.ok({ data: await ExchangeRateService.listForAdmin() })
  }

  /** GET /api/v1/admin/exchange-rates/:id */
  async adminShow({ params, response }: HttpContext) {
    try {
      return response.ok({ data: await ExchangeRateService.findForAdmin(String(params.id)) })
    } catch (error) {
      if (error instanceof CurrencyNotFoundException) return response.notFound({ message: error.message })
      throw error
    }
  }

  /** PATCH /api/v1/admin/exchange-rates/:id — manual rate and margin */
  async adminUpdate({ auth, params, request, response, correlationId }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(updateExchangeRateValidator)
    try {
      const data = await ExchangeRateService.update(String(params.id), payload, user.id, correlationId)
      return response.ok({ data })
    } catch (error) {
      if (error instanceof CurrencyNotFoundException) return response.notFound({ message: error.message })
      if (error instanceof BaseCurrencyRateException) return response.unprocessableEntity({ message: error.message })
      throw error
    }
  }

  /** POST /api/v1/admin/exchange-rates/refresh — pull the international rates now */
  async adminRefresh({ response }: HttpContext) {
    try {
      const { updated } = await ExchangeRateService.refreshMarketRates()
      return response.ok({ data: { updated } })
    } catch (error) {
      if (error instanceof ExchangeRateFeedException) {
        return response.badGateway({ message: error.message })
      }
      throw error
    }
  }
}
