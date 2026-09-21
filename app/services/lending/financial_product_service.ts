import { DateTime } from 'luxon'
import FinancialProduct from '#models/financial_product'
import type { FinancialProductKind, FinancialProductStatus } from '#models/financial_product'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class ProductNotFoundException extends Error {
  constructor() {
    super('Financial product not found')
    this.name = 'ProductNotFoundException'
  }
}

export class ProductTransitionException extends Error {
  constructor(from: FinancialProductStatus, action: string) {
    super(`A product in status "${from}" cannot be ${action}`)
    this.name = 'ProductTransitionException'
  }
}

export interface ProductDraft {
  code: string
  name: string
  description?: string | null
  kind: FinancialProductKind
  currencyCode: string
  minAmount?: bigint | null
  maxAmount?: bigint | null
  interestRateBps: number
  interestPeriod: 'month' | 'year'
  interestMethod?: 'flat' | 'declining' | null
  termMonthsMin?: number | null
  termMonthsMax?: number | null
  feeFlat?: bigint | null
  feePercentBps?: number | null
  mandatorySavingsBps?: number | null
}

/**
 * The lifecycle of a catalogue entry: an institution drafts a product, submits it, and someone at
 * TumaPlus publishes or refuses it.
 *
 *   draft ──submit──▶ pending_review ──approve──▶ active ──archive──▶ archived
 *     ▲                     │
 *     └──────reject─────────┘  (rejected, and editable again)
 *
 * The review step is the point of the whole service. A product reaches borrowers inside TumaPlus's
 * own application, under TumaPlus's name, so no institution publishes a rate to that audience
 * without someone here having read it. Every transition is refused from the wrong state rather
 * than quietly ignored, and each one is audited — a published rate is a commitment to borrowers,
 * and who allowed it has to be answerable later.
 *
 * Editing is confined to states where nobody has been shown the product yet. Once it is live, a
 * change would alter an offer people may already be acting on, so it goes back through review.
 */
export class FinancialProductService {
  private static readonly EDITABLE: FinancialProductStatus[] = ['draft', 'rejected']

  /**
   * Products always start as drafts. An institution cannot create something already published,
   * whatever it sends.
   */
  static async create(
    providerId: number,
    draft: ProductDraft,
    correlationId: string
  ): Promise<FinancialProduct> {
    const product = await FinancialProduct.create({
      providerId,
      code: draft.code,
      name: draft.name,
      description: draft.description ?? null,
      kind: draft.kind,
      currencyCode: draft.currencyCode,
      minAmount: draft.minAmount ?? null,
      maxAmount: draft.maxAmount ?? null,
      interestRateBps: draft.interestRateBps,
      interestPeriod: draft.interestPeriod,
      interestMethod: draft.interestMethod ?? null,
      termMonthsMin: draft.termMonthsMin ?? null,
      termMonthsMax: draft.termMonthsMax ?? null,
      feeFlat: draft.feeFlat ?? null,
      feePercentBps: draft.feePercentBps ?? null,
      mandatorySavingsBps: draft.mandatorySavingsBps ?? null,
      status: 'draft',
    })

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: providerId,
      action: 'financial_product.created',
      resourceType: 'financial_product',
      resourceId: product.id,
      before: undefined,
      after: { code: product.code, kind: product.kind, status: product.status },
      correlationId,
    })

    return product
  }

  /**
   * Edits are confined to states where the product has never been shown to anyone. A live product
   * is an offer borrowers may already be acting on; changing it means going through review again.
   */
  static async update(
    product: FinancialProduct,
    changes: Partial<ProductDraft>,
    correlationId: string
  ): Promise<FinancialProduct> {
    if (!this.EDITABLE.includes(product.status)) {
      throw new ProductTransitionException(product.status, 'edited')
    }

    const before = { name: product.name, interest_rate_bps: product.interestRateBps }
    product.merge(changes)
    await product.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: product.providerId,
      action: 'financial_product.updated',
      resourceType: 'financial_product',
      resourceId: product.id,
      before,
      after: { name: product.name, interest_rate_bps: product.interestRateBps },
      correlationId,
    })

    return product
  }

  /** Hands the product to TumaPlus for review. Rejected products may be resubmitted. */
  static async submit(product: FinancialProduct, correlationId: string) {
    if (!this.EDITABLE.includes(product.status)) {
      throw new ProductTransitionException(product.status, 'submitted')
    }

    const before = product.status
    product.status = 'pending_review'
    product.submittedAt = DateTime.now()
    // Cleared so a stale refusal is never shown beside a pending submission.
    product.reviewNotes = null
    await product.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: product.providerId,
      action: 'financial_product.submitted',
      resourceType: 'financial_product',
      resourceId: product.id,
      before: { status: before },
      after: { status: product.status },
      correlationId,
    })

    return product
  }

  /** Publishes the product to borrowers. Only ever from review — never straight from a draft. */
  static async approve(product: FinancialProduct, reviewerId: number, correlationId: string) {
    if (product.status !== 'pending_review') {
      throw new ProductTransitionException(product.status, 'approved')
    }

    product.status = 'active'
    product.reviewedAt = DateTime.now()
    product.reviewedBy = reviewerId
    product.reviewNotes = null
    await product.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: reviewerId,
      action: 'financial_product.approved',
      resourceType: 'financial_product',
      resourceId: product.id,
      before: { status: 'pending_review' },
      after: {
        status: product.status,
        provider_id: product.providerId,
        interest_rate_bps: product.interestRateBps,
      },
      correlationId,
    })

    return product
  }

  /**
   * Refuses publication. `notes` is required and reaches the institution verbatim — a refusal
   * without a reason only produces a resubmission of the same thing.
   */
  static async reject(
    product: FinancialProduct,
    reviewerId: number,
    notes: string,
    correlationId: string
  ) {
    if (product.status !== 'pending_review') {
      throw new ProductTransitionException(product.status, 'rejected')
    }

    product.status = 'rejected'
    product.reviewedAt = DateTime.now()
    product.reviewedBy = reviewerId
    product.reviewNotes = notes
    await product.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: reviewerId,
      action: 'financial_product.rejected',
      resourceType: 'financial_product',
      resourceId: product.id,
      before: { status: 'pending_review' },
      after: { status: product.status, notes },
      correlationId,
    })

    return product
  }

  /**
   * Withdraws a product from the catalogue. Deliberately not a delete: accounts and loans sold
   * under it will reference it for years, and their terms have to remain readable.
   */
  static async archive(
    product: FinancialProduct,
    actor: { type: 'business' | 'internal_user'; id: number },
    correlationId: string
  ) {
    if (product.status === 'archived') {
      throw new ProductTransitionException(product.status, 'archived')
    }

    const before = product.status
    product.status = 'archived'
    await product.save()

    await AuditLoggerService.record({
      actorType: actor.type,
      actorId: actor.id,
      action: 'financial_product.archived',
      resourceType: 'financial_product',
      resourceId: product.id,
      before: { status: before },
      after: { status: product.status },
      correlationId,
    })

    return product
  }

  /**
   * What borrowers may see: published products only, and only from institutions that are
   * themselves active. An institution suspended today must not keep selling through yesterday's
   * approvals, which is why the provider's status is joined rather than assumed.
   */
  static async listPublished(filters: { kind?: FinancialProductKind; currencyCode?: string } = {}) {
    const query = FinancialProduct.query()
      .where('status', 'active')
      .whereHas('provider', (provider) => provider.where('status', 'active'))
      .preload('provider')

    if (filters.kind) query.where('kind', filters.kind)
    if (filters.currencyCode) query.where('currency_code', filters.currencyCode)

    return query.orderBy('interest_rate_bps', 'asc')
  }

  /** Resolves a product owned by this provider, so no institution can act on another's. */
  static async requireOwned(productId: number, providerId: number): Promise<FinancialProduct> {
    const product = await FinancialProduct.query()
      .where('id', productId)
      .where('provider_id', providerId)
      .first()

    if (!product) {
      throw new ProductNotFoundException()
    }
    return product
  }
}
