import type { HttpContext } from '@adonisjs/core/http'
import FinancialProduct from '#models/financial_product'
import {
  FinancialProductService,
  ProductNotFoundException,
  ProductTransitionException,
} from '#services/lending/financial_product_service'
import {
  createFinancialProductValidator,
  updateFinancialProductValidator,
} from '#validators/financial_products'
import { serializeProduct } from '#controllers/lending/serialize_product'

/**
 * An institution managing its own catalogue, from its dashboard.
 *
 * Every read and write is scoped to ctx.business — set identically by the API-key, dashboard and
 * staff middleware — so an institution can never reach another's products. Nothing here can
 * publish: approval belongs to admin/financial_products_controller.ts, because these products are
 * shown to borrowers under TumaPlus's name.
 */
export default class LendingProductsController {
  /** GET /api/v1/business/dashboard/products */
  async index({ business, response }: HttpContext) {
    const products = await FinancialProduct.query()
      .where('provider_id', business.id)
      .orderBy('created_at', 'desc')

    return response.ok({ data: products.map(serializeProduct) })
  }

  /** GET /api/v1/business/dashboard/products/:id */
  async show({ business, params, response }: HttpContext) {
    try {
      const product = await FinancialProductService.requireOwned(Number(params.id), business.id)
      return response.ok({ data: serializeProduct(product) })
    } catch (error) {
      if (error instanceof ProductNotFoundException) {
        return response.notFound({ message: error.message })
      }
      throw error
    }
  }

  /** POST /api/v1/business/dashboard/products */
  async store({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createFinancialProductValidator)

    const duplicate = await FinancialProduct.query()
      .where('provider_id', business.id)
      .where('code', payload.code)
      .first()
    if (duplicate) {
      return response.conflict({
        message: 'You already have a product with this code.',
        code: 'E_PRODUCT_CODE_TAKEN',
      })
    }

    try {
      const product = await FinancialProductService.create(
        business.id,
        {
          code: payload.code,
          name: payload.name,
          description: payload.description ?? null,
          kind: payload.kind,
          currencyCode: payload.currency_code.toUpperCase(),
          minAmount: payload.min_amount ? BigInt(payload.min_amount) : null,
          maxAmount: payload.max_amount ? BigInt(payload.max_amount) : null,
          interestRateBps: payload.interest_rate_bps,
          interestPeriod: payload.interest_period,
          interestMethod: payload.interest_method ?? null,
          termMonthsMin: payload.term_months_min ?? null,
          termMonthsMax: payload.term_months_max ?? null,
          feeFlat: payload.fee_flat ? BigInt(payload.fee_flat) : null,
          feePercentBps: payload.fee_percent_bps ?? null,
          mandatorySavingsBps: payload.mandatory_savings_bps ?? null,
        },
        correlationId
      )

      return response.created({ data: serializeProduct(product) })
    } catch (error) {
      // The database states the loan/interest-method rule once for every writer; surface it as a
      // request error rather than letting a constraint violation become a 500.
      const message = (error as Error).message || ''
      if (message.includes('financial_products_loan_method')) {
        return response.badRequest({
          message: 'A loan must state its interest method, and only a loan may have one.',
          code: 'E_INTEREST_METHOD',
        })
      }
      if (message.includes('financial_products_amount_range')) {
        return response.badRequest({ message: 'The minimum amount exceeds the maximum.' })
      }
      if (message.includes('financial_products_term_range')) {
        return response.badRequest({ message: 'The minimum term exceeds the maximum.' })
      }
      throw error
    }
  }

  /** PATCH /api/v1/business/dashboard/products/:id */
  async update({ business, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(updateFinancialProductValidator)

    try {
      const product = await FinancialProductService.requireOwned(Number(params.id), business.id)

      const updated = await FinancialProductService.update(
        product,
        {
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.description !== undefined && { description: payload.description }),
          ...(payload.min_amount !== undefined && { minAmount: BigInt(payload.min_amount) }),
          ...(payload.max_amount !== undefined && { maxAmount: BigInt(payload.max_amount) }),
          ...(payload.interest_rate_bps !== undefined && {
            interestRateBps: payload.interest_rate_bps,
          }),
          ...(payload.interest_period !== undefined && {
            interestPeriod: payload.interest_period,
          }),
          ...(payload.interest_method !== undefined && {
            interestMethod: payload.interest_method,
          }),
          ...(payload.term_months_min !== undefined && {
            termMonthsMin: payload.term_months_min,
          }),
          ...(payload.term_months_max !== undefined && {
            termMonthsMax: payload.term_months_max,
          }),
          ...(payload.fee_flat !== undefined && { feeFlat: BigInt(payload.fee_flat) }),
          ...(payload.fee_percent_bps !== undefined && {
            feePercentBps: payload.fee_percent_bps,
          }),
          ...(payload.mandatory_savings_bps !== undefined && {
            mandatorySavingsBps: payload.mandatory_savings_bps,
          }),
        },
        correlationId
      )

      return response.ok({ data: serializeProduct(updated) })
    } catch (error) {
      return this.handleTransition(error, response)
    }
  }

  /** POST /api/v1/business/dashboard/products/:id/submit */
  async submit({ business, params, correlationId, response }: HttpContext) {
    try {
      const product = await FinancialProductService.requireOwned(Number(params.id), business.id)
      const submitted = await FinancialProductService.submit(product, correlationId)
      return response.ok({ data: serializeProduct(submitted) })
    } catch (error) {
      return this.handleTransition(error, response)
    }
  }

  /** POST /api/v1/business/dashboard/products/:id/archive */
  async archive({ business, params, correlationId, response }: HttpContext) {
    try {
      const product = await FinancialProductService.requireOwned(Number(params.id), business.id)
      const archived = await FinancialProductService.archive(
        product,
        { type: 'business', id: business.id },
        correlationId
      )
      return response.ok({ data: serializeProduct(archived) })
    } catch (error) {
      return this.handleTransition(error, response)
    }
  }

  private handleTransition(error: unknown, response: HttpContext['response']) {
    if (error instanceof ProductNotFoundException) {
      return response.notFound({ message: error.message })
    }
    if (error instanceof ProductTransitionException) {
      return response.conflict({ message: error.message, code: 'E_PRODUCT_STATE' })
    }
    throw error
  }
}
