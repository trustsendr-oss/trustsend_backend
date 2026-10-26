import type { HttpContext } from '@adonisjs/core/http'
import { BusinessLogoService } from '#services/business/business_logo_service'
import type FinancialProduct from '#models/financial_product'
import { FinancialProductService } from '#services/lending/financial_product_service'
import {
  listInstitutionsValidator,
  listPublishedProductsValidator,
} from '#validators/financial_products'
import { serializeProduct } from '#controllers/lending/serialize_product'

/**
 * review_notes is correspondence between TumaPlus and the institution; a borrower has no business
 * reading why an earlier version of this offer was refused.
 */
function publicProduct(product: FinancialProduct) {
  const visible = serializeProduct(product)
  delete (visible as Partial<typeof visible>).review_notes
  return visible
}

const KIND_ORDER = ['savings', 'term_deposit', 'loan'] as const

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

    return response.ok({ data: products.map(publicProduct) })
  }

  /** GET /api/v1/finance/products/:id */
  async showProduct({ params, response }: HttpContext) {
    const product = await FinancialProductService.findPublished(Number(params.id))
    if (!product) return response.notFound({ message: 'Offer not found' })

    return response.ok({ data: publicProduct(product) })
  }

  /** GET /api/v1/finance/institutions — paginated, searchable by name. */
  async institutions({ request, response }: HttpContext) {
    const filters = await request.validateUsing(listInstitutionsValidator)
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const result = await FinancialProductService.listInstitutions({
      search: filters.search || undefined,
      page,
      limit,
    })

    return response.ok({
      data: result.page.all().map((business) => {
        const offers = result.products.filter((product) => product.providerId === business.id)
        return {
          id: business.id,
          name: business.name,
          kind: business.kind,
          logo_url: BusinessLogoService.urlOf(business),
          kinds: KIND_ORDER.filter((kind) => offers.some((product) => product.kind === kind)),
          product_count: offers.length,
        }
      }),
      meta: {
        total: result.page.total,
        page: result.page.currentPage,
        limit,
      },
    })
  }

  /** GET /api/v1/finance/institutions/:id — with its published offers. */
  async showInstitution({ params, response }: HttpContext) {
    const result = await FinancialProductService.findInstitution(Number(params.id))
    if (!result) return response.notFound({ message: 'Institution not found' })

    return response.ok({
      data: {
        id: result.business.id,
        name: result.business.name,
        kind: result.business.kind,
        logo_url: BusinessLogoService.urlOf(result.business),
        products: result.products.map(publicProduct),
      },
    })
  }
}
