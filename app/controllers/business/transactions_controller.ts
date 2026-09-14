import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import LedgerTransaction from '#models/ledger_transaction'

const listTransactionsValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
})

export default class BusinessTransactionsController {
  /**
   * GET /api/v1/business/transactions
   * Paginated mobile money transaction history for this business.
   */
  async index({ business, request, response }: HttpContext) {
    const query = await request.validateUsing(listTransactionsValidator)
    const page = query.page || 1
    const limit = query.limit || 20

    const paginated = await LedgerTransaction.query()
      .where('initiated_by_type', 'business')
      .where('initiated_by_id', business.id)
      .whereIn('type', [
        'mobile_money_deposit',
        'mobile_money_payout',
        'business_plan_subscription',
        'business_plan_maintenance_fee',
        'fx_swap',
        'sandbox_funding',
      ])
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    return response.ok({
      data: paginated.all().map((txn) => ({
        transaction_id: txn.id,
        type: txn.type,
        status: txn.status,
        provider: txn.provider,
        metadata: txn.metadata,
        created_at: txn.createdAt,
        completed_at: txn.completedAt,
      })),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit,
      },
    })
  }
}
