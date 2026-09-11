import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import LedgerTransaction from '#models/ledger_transaction'
import LedgerEntry from '#models/ledger_entry'
import LedgerAccount from '#models/ledger_account'
import Dispute from '#models/dispute'
import User from '#models/user'
import Agent from '#models/agent'
import Business from '#models/business'
import InternalUser from '#models/internal_user'

const listValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
  sort: vine.string().optional(),
  order: vine.string().optional(),
})

const ALLOWED_SORT_FIELDS: Record<string, string> = {
  id: 'id',
  created_at: 'created_at',
  amount: 'amount',
  status: 'status',
  type: 'type',
  currency_code: 'currency_code',
}

const VALID_STATUSES = [
  'initiated',
  'pending',
  'processing',
  'completed',
  'failed',
  'reversed',
  'reserved',
  'settled',
  'cancelled',
  'rejected',
]
const VALID_INITIATED_BY_TYPES = ['user', 'agent', 'system', 'internal_user', 'business']

/**
 * Platform-wide transaction visibility for admins — everything else that touches
 * LedgerTransaction (business/transactions_controller.ts, wallets, cards) is scoped to a single
 * caller. This is the first endpoint that lets an internal user see and filter every transaction
 * regardless of who initiated it, which is why it lives under its own admin/ namespace rather
 * than extending an existing scoped controller.
 *
 * Paginated (unlike /agents, /businesses, /kyc, /disputes) because transaction volume is
 * expected to be orders of magnitude larger than those admin/back-office lists — mirrors
 * business/transactions_controller.ts's own paginate() convention.
 */
export default class AdminTransactionsController {
  /**
   * `initiated_by_type`/`initiated_by_id` alone forces the reviewer to go look the id up
   * elsewhere, so both index() and show() resolve it to a display name — batched by type here
   * (one query per type, not per row) so a page of transactions from a mix of users/agents/
   * businesses doesn't turn into an N+1. Keyed as "type:id" since ids aren't unique across types.
   */
  private async resolveInitiatorNames(
    entries: { type: string; id: number }[]
  ): Promise<Map<string, string>> {
    const userIds = new Set<number>()
    const agentIds = new Set<number>()
    const businessIds = new Set<number>()
    const internalUserIds = new Set<number>()

    for (const { type, id } of entries) {
      if (type === 'user') userIds.add(id)
      else if (type === 'agent') agentIds.add(id)
      else if (type === 'business') businessIds.add(id)
      else if (type === 'internal_user') internalUserIds.add(id)
    }

    const [users, agents, businesses, internalUsers] = await Promise.all([
      userIds.size ? User.query().whereIn('id', [...userIds]) : [],
      agentIds.size ? Agent.query().whereIn('id', [...agentIds]) : [],
      businessIds.size ? Business.query().whereIn('id', [...businessIds]) : [],
      internalUserIds.size ? InternalUser.query().whereIn('id', [...internalUserIds]) : [],
    ])

    const names = new Map<string, string>()
    for (const u of users) names.set(`user:${u.id}`, u.fullName || u.email)
    for (const a of agents) names.set(`agent:${a.id}`, a.fullName)
    for (const b of businesses) names.set(`business:${b.id}`, b.name)
    for (const iu of internalUsers) names.set(`internal_user:${iu.id}`, iu.fullName)
    return names
  }

  private initiatorName(names: Map<string, string>, type: string, id: number): string {
    if (type === 'system') return 'System'
    return names.get(`${type}:${id}`) ?? `${type} #${id}`
  }

  /**
   * GET /api/v1/admin/transactions
   * Filters: status, type, initiated_by_type, initiated_by_id, provider, currency_code,
   * payment_method, has_failure_reason, date_from, date_to (on created_at), q (matches
   * id/uuid/correlation_id).
   */
  async index({ request, response }: HttpContext) {
    const {
      page: pageInput,
      limit: limitInput,
      sort: sortInput,
      order: orderInput,
    } = await request.validateUsing(listValidator)
    const page = pageInput || 1
    const limit = limitInput || 25

    const sortField = (sortInput && ALLOWED_SORT_FIELDS[sortInput]) || 'created_at'
    const sortOrder = orderInput?.toLowerCase() === 'asc' ? 'asc' : 'desc'

    const status = request.input('status') as string | undefined
    if (status && !VALID_STATUSES.includes(status)) {
      return response.badRequest({ message: `Invalid status filter: ${status}` })
    }

    const initiatedByType = request.input('initiated_by_type') as string | undefined
    if (initiatedByType && !VALID_INITIATED_BY_TYPES.includes(initiatedByType)) {
      return response.badRequest({
        message: `Invalid initiated_by_type filter: ${initiatedByType}`,
      })
    }

    const type = request.input('type') as string | undefined
    const initiatedById = request.input('initiated_by_id') as string | undefined
    const provider = request.input('provider') as string | undefined
    const currencyCode = request.input('currency_code') as string | undefined
    const paymentMethod = request.input('payment_method') as string | undefined
    const hasFailureReason = request.input('has_failure_reason') as string | undefined
    const dateFrom = request.input('date_from') as string | undefined
    const dateTo = request.input('date_to') as string | undefined
    const q = request.input('q') as string | undefined

    const query = LedgerTransaction.query().orderBy(sortField, sortOrder)

    if (status) query.where('status', status)
    if (type) query.where('type', type)
    if (initiatedByType) query.where('initiated_by_type', initiatedByType)
    if (initiatedById) query.where('initiated_by_id', Number(initiatedById))
    if (provider) query.where('provider', provider)
    if (paymentMethod) query.where('payment_method', paymentMethod)
    if (hasFailureReason) query.whereNotNull('failure_reason')

    // currency_code filters the transaction's own denormalized column when set (see migration
    // 1793400000000_...), falling back to a ledger_entries join for older/unbackfilled rows
    // where it's still NULL.
    if (currencyCode) {
      query.where((sub) => {
        sub.where('currency_code', currencyCode).orWhereExists((exists) => {
          exists
            .from('ledger_entries')
            .whereRaw('ledger_entries.ledger_transaction_id = ledger_transactions.id')
            .where('ledger_entries.currency_code', currencyCode)
        })
      })
    }

    if (dateFrom) {
      const from = DateTime.fromISO(dateFrom)
      if (!from.isValid) return response.badRequest({ message: 'Invalid date_from' })
      query.where('created_at', '>=', from.toSQL()!)
    }
    if (dateTo) {
      const to = DateTime.fromISO(dateTo)
      if (!to.isValid) return response.badRequest({ message: 'Invalid date_to' })
      query.where('created_at', '<=', to.toSQL()!)
    }

    if (q) {
      // uuid is a native Postgres `uuid` column (see 3_create_ledger_transactions_table.ts) —
      // ilike (~~*) has no operator for that type, only for text, so it must be cast explicitly.
      query.where((sub) => {
        sub
          .where('id', 'ilike', `%${q}%`)
          .orWhereRaw('uuid::text ilike ?', [`%${q}%`])
          .orWhere('correlation_id', 'ilike', `%${q}%`)
      })
    }

    const paginated = await query.paginate(page, limit)
    const rows = paginated.all()
    const names = await this.resolveInitiatorNames(
      rows.map((txn) => ({ type: txn.initiatedByType, id: txn.initiatedById }))
    )

    return response.ok({
      data: rows.map((txn) => ({
        id: txn.id,
        uuid: txn.uuid,
        type: txn.type,
        status: txn.status,
        initiated_by_type: txn.initiatedByType,
        initiated_by_id: txn.initiatedById,
        initiated_by_name: this.initiatorName(names, txn.initiatedByType, txn.initiatedById),
        amount: txn.amount?.toString() ?? null,
        currency_code: txn.currencyCode,
        payment_method: txn.paymentMethod,
        payment_channel: txn.paymentChannel,
        fee: txn.fee?.toString() ?? null,
        failure_reason: txn.failureReason,
        related_transaction_id: txn.relatedTransactionId,
        provider: txn.provider,
        provider_reference_id: txn.providerReferenceId,
        description: txn.description,
        created_at: txn.createdAt,
        completed_at: txn.completedAt,
        reversed_at: txn.reversedAt,
      })),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit,
        last_page: paginated.lastPage,
      },
    })
  }

  /**
   * GET /api/v1/admin/transactions/:id
   * Detail + its double-entry ledger_entries, the RiskAssessment scored against it (if any), and
   * any Dispute filed against it — everything an admin needs to investigate one transaction
   * without jumping between screens.
   */
  async show({ params, response }: HttpContext) {
    const txn = await LedgerTransaction.findOrFail(params.id)

    const entries = await LedgerEntry.query()
      .where('ledger_transaction_id', txn.id)
      .orderBy('created_at', 'asc')

    const accountIds = [...new Set(entries.map((e) => e.ledgerAccountId))]
    const accounts = accountIds.length
      ? await LedgerAccount.query().whereIn('id', accountIds)
      : []
    const accountsById = new Map(accounts.map((a) => [a.id, a]))

    // No RiskAssessment lookup here: risk_assessments.ledger_transaction_id is still an integer
    // column (migration 1725050000000_change_ids_to_varchar.ts dropped its FK via CASCADE when
    // ledger_transactions.id became varchar, but never converted this column) and nothing in the
    // codebase writes RiskAssessment rows anymore — the table is effectively dead. Comparing
    // txn.id (a string) against it would throw a Postgres type error, not just return no rows.

    const dispute = await Dispute.query().where('ledger_transaction_id', txn.id).first()

    // The mobile money "tracking" row and its "posted" double-entry counterpart are two
    // separate LedgerTransaction rows (see mobile_money_deposit_service.ts confirmFromCallback())
    // linked only via related_transaction_id — resolve it to a mini-summary so the admin isn't
    // left staring at a bare id, same treatment as `dispute` below.
    const related = txn.relatedTransactionId
      ? await LedgerTransaction.find(txn.relatedTransactionId)
      : null

    const names = await this.resolveInitiatorNames([
      { type: txn.initiatedByType, id: txn.initiatedById },
    ])

    return response.ok({
      data: {
        id: txn.id,
        uuid: txn.uuid,
        type: txn.type,
        status: txn.status,
        idempotency_key: txn.idempotencyKey,
        correlation_id: txn.correlationId,
        initiated_by_type: txn.initiatedByType,
        initiated_by_id: txn.initiatedById,
        initiated_by_name: this.initiatorName(names, txn.initiatedByType, txn.initiatedById),
        amount: txn.amount?.toString() ?? null,
        currency_code: txn.currencyCode,
        payment_method: txn.paymentMethod,
        payment_channel: txn.paymentChannel,
        counterparty_phone: txn.counterpartyPhone,
        fee: txn.fee?.toString() ?? null,
        failure_reason: txn.failureReason,
        related_transaction: related
          ? { id: related.id, type: related.type, status: related.status }
          : null,
        reversal_of_transaction_id: txn.reversalOfTransactionId,
        description: txn.description,
        metadata: txn.metadata,
        provider: txn.provider,
        provider_reference_id: txn.providerReferenceId,
        created_at: txn.createdAt,
        completed_at: txn.completedAt,
        reversed_at: txn.reversedAt,
        entries: entries.map((e) => ({
          id: e.id,
          ledger_account_id: e.ledgerAccountId,
          account_code: accountsById.get(e.ledgerAccountId)?.code ?? null,
          account_name: accountsById.get(e.ledgerAccountId)?.name ?? null,
          owner_type: accountsById.get(e.ledgerAccountId)?.ownerType ?? null,
          owner_id: accountsById.get(e.ledgerAccountId)?.ownerId ?? null,
          direction: e.direction,
          amount: e.amount.toString(),
          currency_code: e.currencyCode,
          balance_after: e.balanceAfter.toString(),
          created_at: e.createdAt,
        })),
        dispute: dispute
          ? { id: dispute.id, status: dispute.status, opened_at: dispute.openedAt }
          : null,
      },
    })
  }
}
