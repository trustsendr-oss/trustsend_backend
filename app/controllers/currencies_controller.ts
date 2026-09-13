import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import InternalUser from '#models/internal_user'
import type Currency from '#models/currency'
import { CurrencyService, CurrencyNotFoundException } from '#services/money/currency_service'

const listCurrenciesValidator = vine.create({
  q: vine.string().trim().maxLength(100).optional(),
  is_active: vine.boolean().optional(),
})

// code and decimals are not editable — see CurrencyService.update()
const updateCurrencyValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(100).optional(),
  symbol: vine.string().trim().maxLength(10).nullable().optional(),
  logo_url: vine.string().trim().url({ protocols: ['https'] }).maxLength(500).nullable().optional(),
  is_active: vine.boolean().optional(),
  sort_order: vine.number().withoutDecimals().min(0).max(100000).optional(),
})

function adminRecord(currency: Currency) {
  return {
    id: currency.code,
    ...CurrencyService.serialize(currency),
    custom_logo_url: currency.logoUrl,
    sort_order: currency.sortOrder,
    created_at: currency.createdAt,
    updated_at: currency.updatedAt,
  }
}

/**
 * Currency reference data. The public list is what clients offer when opening a wallet; the
 * admin routes decide which currencies are open and override names, symbols and logos.
 */
export default class CurrenciesController {
  /** GET /api/v1/currencies — currencies a new wallet can be opened in */
  async index({ response }: HttpContext) {
    const currencies = await CurrencyService.listActive()
    return response.ok({ data: currencies.map((c) => CurrencyService.serialize(c)) })
  }

  /** GET /api/v1/admin/currencies (admin only) */
  async adminIndex({ request, response }: HttpContext) {
    const { q, is_active: isActive } = await request.validateUsing(listCurrenciesValidator, {
      data: request.qs(),
    })
    const currencies = await CurrencyService.listAll({ q, isActive })
    return response.ok({ data: currencies.map(adminRecord) })
  }

  /** GET /api/v1/admin/currencies/:id (admin only) */
  async adminShow({ params, response }: HttpContext) {
    try {
      const currency = await CurrencyService.findOrFail(String(params.id))
      return response.ok({ data: adminRecord(currency) })
    } catch (error) {
      if (error instanceof CurrencyNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** PATCH /api/v1/admin/currencies/:id (admin only) */
  async adminUpdate({ auth, params, request, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(updateCurrencyValidator)

    try {
      const currency = await CurrencyService.update(String(params.id), payload, user.id, correlationId)
      return response.ok({ data: adminRecord(currency) })
    } catch (error) {
      if (error instanceof CurrencyNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }
}
