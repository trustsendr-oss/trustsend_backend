import type { HttpContext } from '@adonisjs/core/http'
import type InternalUser from '#models/internal_user'
import FinancialProduct from '#models/financial_product'
import {
  FinancialProductService,
  ProductTransitionException,
} from '#services/lending/financial_product_service'
import { rejectFinancialProductValidator } from '#validators/financial_products'
import { serializeProduct } from '#controllers/lending/serialize_product'

/**
 * Review of what partner institutions want to sell — internal_user only.
 *
 * This is the gate the whole catalogue exists around. A product approved here appears inside
 * TumaPlus's own application, under TumaPlus's name, to people deciding whether to borrow; nobody
 * publishes a rate to that audience without someone here having read it.
 *
 * Returns the full unpaginated collection like the other back-office endpoints (see
 * admin/src/providers/dataProvider.ts).
 */
export default class AdminFinancialProductsController {
  /** GET /api/v1/admin/financial-products */
  async index({ request, response }: HttpContext) {
    const status = request.input('status')
    const providerId = request.input('provider_id')

    const query = FinancialProduct.query().preload('provider')
    if (status) query.where('status', String(status))
    if (providerId) query.where('provider_id', Number(providerId))

    // Pending submissions first: this list is a review queue before it is a catalogue.
    const products = await query
      .orderByRaw(`CASE WHEN status = 'pending_review' THEN 0 ELSE 1 END`)
      .orderBy('submitted_at', 'asc')
      .orderBy('id', 'desc')

    return response.ok({ data: products.map(serializeProduct) })
  }

  /** GET /api/v1/admin/financial-products/:id */
  async show({ params, response }: HttpContext) {
    const product = await FinancialProduct.query()
      .where('id', params.id)
      .preload('provider')
      .firstOrFail()

    return response.ok({ data: serializeProduct(product) })
  }

  /** POST /api/v1/admin/financial-products/:id/approve */
  async approve({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const product = await FinancialProduct.findOrFail(params.id)

    try {
      const approved = await FinancialProductService.approve(product, actor.id, correlationId)
      await approved.load('provider')
      return response.ok({ data: serializeProduct(approved) })
    } catch (error) {
      if (error instanceof ProductTransitionException) {
        return response.conflict({ message: error.message, code: 'E_PRODUCT_STATE' })
      }
      throw error
    }
  }

  /** POST /api/v1/admin/financial-products/:id/reject */
  async reject({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const { notes } = await request.validateUsing(rejectFinancialProductValidator)
    const product = await FinancialProduct.findOrFail(params.id)

    try {
      const rejected = await FinancialProductService.reject(product, actor.id, notes, correlationId)
      await rejected.load('provider')
      return response.ok({ data: serializeProduct(rejected) })
    } catch (error) {
      if (error instanceof ProductTransitionException) {
        return response.conflict({ message: error.message, code: 'E_PRODUCT_STATE' })
      }
      throw error
    }
  }

  /**
   * POST /api/v1/admin/financial-products/:id/archive — pulls a product TumaPlus no longer wants
   * shown, without waiting for its institution to do it.
   */
  async archive({ auth, params, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const product = await FinancialProduct.findOrFail(params.id)

    try {
      const archived = await FinancialProductService.archive(
        product,
        { type: 'internal_user', id: actor.id },
        correlationId
      )
      await archived.load('provider')
      return response.ok({ data: serializeProduct(archived) })
    } catch (error) {
      if (error instanceof ProductTransitionException) {
        return response.conflict({ message: error.message, code: 'E_PRODUCT_STATE' })
      }
      throw error
    }
  }
}
