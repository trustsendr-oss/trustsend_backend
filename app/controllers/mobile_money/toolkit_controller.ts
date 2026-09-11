import type { HttpContext } from '@adonisjs/core/http'
import { PawaPayProvider } from '#services/mobile_money/pawapay_provider'
import { predictProviderValidator, listPaymentMethodsValidator } from '#validators/mobile_money'

const provider = new PawaPayProvider()

export default class MobileMoneyToolkitController {
  /**
   * GET /api/v1/mobile-money/predict-provider
   * Lets the app pre-select the operator from a phone number instead of asking the user to
   * pick one — falls back to null (client shows a manual picker) if PawaPay can't tell.
   */
  async predictProvider({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(predictProviderValidator)
    const predicted = await provider.predictProvider(payload.phone_number, payload.country)

    return response.ok({ data: { provider: predicted } })
  }

  /**
   * GET /api/v1/mobile-money/payment-methods?currency_code=ZMW&operation_type=DEPOSIT
   * Lists every mobile money provider available for a currency + operation, so the client can
   * show real options instead of guessing or failing at deposit/payout time with a 422.
   */
  async listPaymentMethods({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

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
          // Operator logo and country flag, both straight from PawaPay — a picker can render
          // logo + name + flag without shipping its own asset set.
          logo: method.logo,
          country: method.country,
          country_name: method.countryName,
          // The client prepends this to the local number to build `phone_number` — PawaPay
          // wants a full E.164 MSISDN, country code included.
          phone_prefix: method.phonePrefix,
          currency_symbol: method.currencySymbol,
          // Only ever set for DEPOSIT — a payout asks nothing of the recipient.
          authorization: method.authorization,
          // PawaPay's own country flag URL — lets a picker render the operator's flag without
          // shipping its own country→icon mapping. null when active-conf carries none.
          flag: method.flag,
          status: method.status,
          min_amount: method.minAmount.toString(),
          max_amount: method.maxAmount.toString(),
        })),
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({ message: 'Mobile money provider unavailable, try again' })
      }
      throw error
    }
  }

  /**
   * GET /api/v1/mobile-money/payment-methods/raw
   * Full, unfiltered active-conf + availability data exactly as PawaPay returns it — every
   * country/provider/currency/operation type, not narrowed to one currency like
   * listPaymentMethods() above. Use this to build a richer picker or for debugging; prefer
   * listPaymentMethods() for a normal deposit/payout flow.
   */
  async listAllPaymentMethodsRaw({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    try {
      const raw = await provider.getRawPaymentMethodsData()
      return response.ok({
        data: {
          active_configuration: raw.activeConfiguration,
          availability: raw.availability,
        },
      })
    } catch (error) {
      const err = error as any
      if (err.name === 'PawaPayRequestException') {
        return response.serviceUnavailable({ message: 'Mobile money provider unavailable, try again' })
      }
      throw error
    }
  }
}
