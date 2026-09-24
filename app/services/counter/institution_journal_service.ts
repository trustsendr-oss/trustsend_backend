import db from '@adonisjs/lucid/services/db'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import LedgerTransaction from '#models/ledger_transaction'

/** Every movement the journal can show, and nothing else. */
export const JOURNAL_TYPES = [
  'cash_in',
  'cash_out',
  'savings_deposit',
  'savings_withdrawal',
  'savings_interest',
  'loan_disbursement',
  'loan_repayment',
] as const

export type JournalType = (typeof JOURNAL_TYPES)[number]

export interface JournalFilters {
  page: number
  limit: number
  type?: JournalType
  agentId?: number
  /** A transaction id (TXN-…), matched as a prefix, or a customer's 9-digit code. */
  search?: string
}

export interface JournalRow {
  transaction_id: string
  type: string
  status: string
  amount: string | null
  currency_code: string | null
  fee: string | null
  description: string | null
  created_at: string | null
  completed_at: string | null
  teller_session_id: number | null
  agent_id: number | null
  customer: { id: number; code: string | null; full_name: string | null } | null
  operator: { staff_id: number; full_name: string | null } | null
  savings_account_id: number | null
  loan_id: number | null
}

/**
 * The institution's book of movements: cash over its counters, savings and loan activity.
 *
 * Nothing on ledger_transactions says "this belongs to institution X" directly, so the scope is
 * rebuilt from what each posting does carry:
 *  - cash at a counter: the tracking row is stamped with a teller session, which has a business;
 *  - savings and loan postings: `metadata.provider_id` is the institution;
 *  - interest accrual: no provider on the posting, only the savings account, which has one.
 *
 * Only the tracking rows of cash operations are listed. The double-entry posting created at
 * confirm() carries the same type and gross; listing both would show every deposit twice.
 * Those postings have no teller session, which is exactly what keeps them out.
 *
 * Collateral seizures are deliberately absent: their posting names no loan and no institution,
 * so it cannot be scoped without guessing.
 */
export class InstitutionJournalService {
  static scoped(businessId: number): ModelQueryBuilderContract<typeof LedgerTransaction> {
    return LedgerTransaction.query().where((scope) => {
      scope
        .where((cash) =>
          cash
            .whereIn('type', ['cash_in', 'cash_out'])
            .whereIn('teller_session_id', (sessions) =>
              sessions.from('teller_sessions').select('id').where('business_id', businessId)
            )
        )
        .orWhere((book) =>
          book
            .whereIn('type', [
              'savings_deposit',
              'savings_withdrawal',
              'loan_disbursement',
              'loan_repayment',
            ])
            .whereRaw(`metadata->>'provider_id' = ?`, [String(businessId)])
        )
        .orWhere((interest) =>
          interest
            .where('type', 'savings_interest')
            .whereRaw(
              `(metadata->>'savings_account_id')::bigint in (select id from savings_accounts where provider_id = ?)`,
              [businessId]
            )
        )
    })
  }

  static async list(businessId: number, filters: JournalFilters) {
    const query = this.scoped(businessId)

    if (filters.type) query.where('type', filters.type)

    // Only cash has a counter; asking for one counter's journal narrows to its sessions.
    if (filters.agentId) {
      query.whereIn('teller_session_id', (sessions) =>
        sessions
          .from('teller_sessions')
          .select('id')
          .where('business_id', businessId)
          .where('agent_id', filters.agentId!)
      )
    }

    const search = filters.search?.trim()
    if (search) {
      if (/^\d{9}$/.test(search)) {
        const customer = await db.from('users').where('code', search).select('id').first()
        if (!customer) return this.empty(filters)
        this.whereCustomer(query, customer.id)
      } else {
        query.whereILike('id', `${search}%`)
      }
    }

    const paginated = await query
      .orderBy('created_at', 'desc')
      .paginate(filters.page, filters.limit)
    const rows = paginated.all()

    return {
      data: await this.serialize(rows),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit: filters.limit,
        last_page: paginated.lastPage,
      },
    }
  }

  /** Journal rows with whose money moved and, for cash, which teller moved it. */
  static async serialize(rows: LedgerTransaction[]): Promise<JournalRow[]> {
    const meta = (row: LedgerTransaction) => (row.metadata ?? {}) as Record<string, any>
    const num = (value: unknown) => (value === undefined || value === null ? null : Number(value))

    const walletIds = new Set<number>()
    const loanIds = new Set<number>()
    const savingsIds = new Set<number>()
    const sessionIds = new Set<number>()
    for (const row of rows) {
      const m = meta(row)
      if (m.user_wallet_id) walletIds.add(Number(m.user_wallet_id))
      if (m.loan_id) loanIds.add(Number(m.loan_id))
      if (m.savings_account_id) savingsIds.add(Number(m.savings_account_id))
      if (row.tellerSessionId) sessionIds.add(row.tellerSessionId)
    }

    const [wallets, loans, savings, sessions] = await Promise.all([
      walletIds.size
        ? db
            .from('wallets')
            .whereIn('id', [...walletIds])
            .select('id', 'user_id')
        : Promise.resolve([]),
      loanIds.size
        ? db
            .from('loans')
            .whereIn('id', [...loanIds])
            .select('id', 'user_id')
        : Promise.resolve([]),
      savingsIds.size
        ? db
            .from('savings_accounts')
            .whereIn('id', [...savingsIds])
            .select('id', 'user_id')
        : Promise.resolve([]),
      sessionIds.size
        ? db
            .from('teller_sessions')
            .join('business_staff', 'business_staff.id', 'teller_sessions.staff_id')
            .join('users', 'users.id', 'business_staff.user_id')
            .whereIn('teller_sessions.id', [...sessionIds])
            .select(
              'teller_sessions.id',
              'teller_sessions.agent_id',
              'teller_sessions.staff_id',
              'users.full_name'
            )
        : Promise.resolve([]),
    ])

    const walletOwner = new Map(wallets.map((w: any) => [Number(w.id), Number(w.user_id)]))
    const loanOwner = new Map(loans.map((l: any) => [Number(l.id), Number(l.user_id)]))
    const savingsOwner = new Map(savings.map((s: any) => [Number(s.id), Number(s.user_id)]))
    const sessionInfo = new Map(sessions.map((s: any) => [Number(s.id), s]))

    // Whose money moved: the posting names a wallet, a loan or a savings account; failing that,
    // a user who initiated it (savings movements and repayments are posted in the holder's name).
    const customerIdOf = (row: LedgerTransaction): number | null => {
      const m = meta(row)
      if (m.user_wallet_id) return walletOwner.get(Number(m.user_wallet_id)) ?? null
      if (m.savings_account_id) return savingsOwner.get(Number(m.savings_account_id)) ?? null
      if (m.loan_id) return loanOwner.get(Number(m.loan_id)) ?? null
      if (row.initiatedByType === 'user') return row.initiatedById
      return null
    }

    const userIds = new Set<number>()
    for (const row of rows) {
      const id = customerIdOf(row)
      if (id) userIds.add(id)
    }
    const users = userIds.size
      ? await db
          .from('users')
          .whereIn('id', [...userIds])
          .select('id', 'code', 'full_name')
      : []
    const userById = new Map(users.map((u: any) => [Number(u.id), u]))

    return rows.map((row) => {
      const m = meta(row)
      const customerId = customerIdOf(row)
      const customer = customerId ? userById.get(customerId) : null
      const session = row.tellerSessionId ? sessionInfo.get(row.tellerSessionId) : null
      return {
        transaction_id: row.id,
        type: row.type,
        status: row.status,
        amount: row.amount?.toString() ?? m.amount ?? null,
        currency_code: row.currencyCode ?? m.currency_code ?? null,
        fee: row.fee?.toString() ?? null,
        description: row.description,
        created_at: row.createdAt?.toISO() ?? null,
        completed_at: row.completedAt?.toISO() ?? null,
        teller_session_id: row.tellerSessionId,
        agent_id: session ? Number(session.agent_id) : num(m.agent_id),
        customer: customer
          ? { id: Number(customer.id), code: customer.code, full_name: customer.full_name }
          : null,
        operator: session
          ? { staff_id: Number(session.staff_id), full_name: session.full_name ?? null }
          : null,
        savings_account_id: num(m.savings_account_id),
        loan_id: num(m.loan_id),
      }
    })
  }

  /** Movements where this person's money moved, by whichever link the posting carries. */
  private static whereCustomer(
    query: ModelQueryBuilderContract<typeof LedgerTransaction>,
    userId: number
  ) {
    query.where((who) => {
      who
        .whereRaw(
          `(metadata->>'user_wallet_id')::bigint in (select id from wallets where user_id = ?)`,
          [userId]
        )
        .orWhereRaw(`(metadata->>'loan_id')::bigint in (select id from loans where user_id = ?)`, [
          userId,
        ])
        .orWhereRaw(
          `(metadata->>'savings_account_id')::bigint in (select id from savings_accounts where user_id = ?)`,
          [userId]
        )
    })
  }

  private static empty(filters: JournalFilters) {
    return {
      data: [] as JournalRow[],
      meta: { total: 0, page: filters.page, limit: filters.limit, last_page: 1 },
    }
  }
}
