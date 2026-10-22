import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import LedgerTransaction from '#models/ledger_transaction'
import User from '#models/user'

const listValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  currency_code: vine.string().trim().toUpperCase().maxLength(10).optional(),
})

export default class BusinessMerchantPaymentsController {
  /**
   * GET /api/v1/business/merchant-payments (API key) and /business/dashboard/merchant-payments
   * Payments customers made to this merchant, newest first. They are started by the customer,
   * so they are found by the merchant named in their metadata, not by `initiated_by` like the
   * business's own transactions.
   */
  async index({ business, request, response }: HttpContext) {
    const query = await request.validateUsing(listValidator)
    const page = query.page || 1
    const limit = query.limit || 20

    const dbQuery = LedgerTransaction.query()
      .where('type', 'merchant_payment')
      .whereRaw(`(metadata->>'business_id')::int = ?`, [business.id])
      .orderBy('created_at', 'desc')
    if (query.currency_code) dbQuery.where('currency_code', query.currency_code)

    const result = await dbQuery.paginate(page, limit)
    const customerRows = await User.query().whereIn(
      'id',
      result.all().map((t) => t.initiatedById)
    )
    const customers = new Map(customerRows.map((u) => [u.id, u]))

    return response.ok({
      data: result.all().map((txn) => {
        const customer = customers.get(txn.initiatedById)
        const metadata = (txn.metadata ?? {}) as Record<string, any>
        return {
          id: txn.id,
          uuid: txn.uuid,
          status: txn.status,
          amount: String(txn.amount ?? '0'),
          fee: String(txn.fee ?? '0'),
          net_amount: String(metadata.net_to_merchant ?? txn.amount ?? '0'),
          currency_code: txn.currencyCode,
          customer: customer ? { name: customer.fullName, code: customer.code } : null,
          note: metadata.note ?? null,
          created_at: txn.createdAt,
        }
      }),
      meta: { total: result.total, page: result.currentPage, limit },
    })
  }
}
