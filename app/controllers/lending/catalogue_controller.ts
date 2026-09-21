import type { HttpContext } from '@adonisjs/core/http'
import { FinancialProductService } from '#services/lending/financial_product_service'
import { listPublishedProductsValidator } from '#validators/financial_products'
import { serializeProduct } from '#controllers/lending/serialize_product'

/**
 * What a borrower sees: the published offers of active institutions.
 *
 * Deliberately shows nothing an institution has not had approved, and nothing from an institution
 * that is no longer active — yesterday's approval is not a licence to keep selling today, which is
 * why FinancialProductService.listPublished joins the provider's status rather than assuming it.
 *
 * Nothing here is personalised and nothing is committed: this is a catalogue, not an application.
 */
export default class LendingCatalogueController {
  /** GET /api/v1/finance/products */
  async index({ request, response }: HttpContext) {
    const filters = await request.validateUsing(listPublishedProductsValidator)

    const products = await FinancialProductService.listPublished({
      kind: filters.kind,
      currencyCode: filters.currency_code?.toUpperCase(),
    })

    return response.ok({
      // review_notes is correspondence between TumaPlus and the institution; a borrower has no
      // business reading why an earlier version of this offer was refused.
      data: products.map((product) => {
        const visible = serializeProduct(product)
        delete (visible as Partial<typeof visible>).review_notes
        return visible
      }),
    })
  }
}
