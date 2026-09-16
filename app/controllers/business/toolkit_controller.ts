import type { HttpContext } from '@adonisjs/core/http'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'
import { listPaymentMethodsValidator } from '#validators/mobile_money'

const provider = new PawaPayProvider()

/**
 * Business equivalent of mobile_money/toolkit_controller.ts — same PawaPayProvider, reachable
 * from both the API key group and the dashboard session group (ctx.business set by either
 * business_api_key_middleware.ts or business_dashboard_middleware.ts).
 */
export default class BusinessToolkitController {
  /**
   * GET /api/v1/business/mobile-money/payment-methods?currency_code=ZMW&operation_type=DEPOSIT
   */
  async listPaymentMethods({ request, response }: HttpContext) {
    const payload = await request.validateUsing(listPaymentMethodsValidator)

    try {
      const methods = await provider.listPaymentMethods(
        payload.currency_code.toUpperCase(),
        payload.operation_type || 'DEPOSIT'
      )

      return response.ok({
        data: methods.map((method) => ({
          provider: method.provider,
          display_name: method.displayName,
          logo: method.logo,
          country: method.country,
          country_name: method.countryName,
          phone_prefix: method.phonePrefix,
          currency_symbol: method.currencySymbol,
          authorization: method.authorization,
          // Same shape as mobile_money/toolkit_controller.ts — see the note there on `flag`.
          flag: method.flag,
          status: method.status,
          min_amount: method.minAmount.toString(),
          max_amount: method.maxAmount.toString(),
        })),
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message: 'Mobile money provider unavailable, try again',
        })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/business/mobile-money/payment-methods/raw
   * Full, unfiltered active-conf + availability data exactly as PawaPay returns it.
   */
  async listAllPaymentMethodsRaw({ response }: HttpContext) {
    try {
      const raw = await provider.getRawPaymentMethodsData()
      console.log(raw)
      return response.ok({
        data: {
          active_configuration: raw.activeConfiguration,
          availability: raw.availability,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({
          message: 'Mobile money provider unavailable, try again',
        })
      }
      throw error
    }
  }
}
