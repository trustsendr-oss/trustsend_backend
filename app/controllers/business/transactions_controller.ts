import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import LedgerTransaction from '#models/ledger_transaction'

const LISTED_TYPES = [
  'mobile_money_deposit',
  'mobile_money_payout',
  'business_plan_subscription',
  'business_plan_maintenance_fee',
  'fx_swap',
  'sandbox_funding',
] as const

const listTransactionsValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  type: vine.enum(LISTED_TYPES).optional(),
  status: vine.enum(['initiated', 'pending', 'completed', 'failed']).optional(),
  currency_code: vine.string().trim().toUpperCase().maxLength(10).optional(),
  date_from: vine.string().trim().optional(),
  date_to: vine.string().trim().optional(),
  q: vine.string().trim().maxLength(100).optional(),
})

export default class BusinessTransactionsController {
  /**
   * GET /api/v1/business/transactions
   * Paginated mobile money transaction history for this business. Optional filters: type,
   * status, currency_code, date_from/date_to (ISO, inclusive) and q (free-text search over the
   * transaction id, phone number, operator code and operator reference).
   */
  async index({ business, request, response }: HttpContext) {
    const query = await request.validateUsing(listTransactionsValidator)
    const page = query.page || 1
    const limit = query.limit || 20

    const dbQuery = LedgerTransaction.query()
      .where('initiated_by_type', 'business')
      .where('initiated_by_id', business.id)
      .whereIn('type', query.type ? [query.type] : [...LISTED_TYPES])
      .orderBy('created_at', 'desc')

    if (query.status) dbQuery.where('status', query.status)
    if (query.currency_code) {
      dbQuery.where((sub) => {
        sub
          .where('currency_code', query.currency_code!)
          .orWhereRaw("metadata->>'currency_code' = ?", [query.currency_code!])
      })
    }

    if (query.date_from) {
      const from = DateTime.fromISO(query.date_from)
      if (!from.isValid) return response.badRequest({ message: 'Invalid date_from' })
      dbQuery.where('created_at', '>=', from.startOf('day').toSQL()!)
    }
    if (query.date_to) {
      const to = DateTime.fromISO(query.date_to)
      if (!to.isValid) return response.badRequest({ message: 'Invalid date_to' })
      dbQuery.where('created_at', '<=', to.endOf('day').toSQL()!)
    }

    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
      dbQuery.where((sub) => {
        sub
          .where('id', 'ilike', like)
          .orWhere('counterparty_phone', 'ilike', like)
          .orWhere('payment_channel', 'ilike', like)
          .orWhereRaw("metadata->>'phone_number' ilike ?", [like])
          .orWhereRaw("metadata->>'provider_code' ilike ?", [like])
          .orWhereRaw("metadata->>'provider_transaction_id' ilike ?", [like])
      })
    }

    const paginated = await dbQuery.paginate(page, limit)

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
