import type { DataProvider, GetListParams, RaRecord } from 'react-admin'
import { apiFetch, apiFetchEnvelope } from './httpClient'

/**
 * Maps a react-admin resource name to its REST path under /api/v1. Most admin list endpoints in
 * this API return the FULL unpaginated collection (see start/routes.ts comments — deliberate,
 * admin/back-office scale), so getList below paginates/sorts/filters client-side after fetching
 * once. kyc and disputes additionally support server-side `status`/subject filters, which are
 * forwarded as query params so a large case queue doesn't have to be pulled in full.
 *
 * transactions/audit_logs/cards are the exception: those admin/* endpoints paginate for real
 * (volume too high to ever pull in full — see PAGINATED_RESOURCES below), returning `{ data,
 * meta: { total } }` instead of a bare `{ data }` array.
 */
const RESOURCE_PATH: Record<string, string> = {
  agents: '/agents',
  businesses: '/businesses',
  users: '/users',
  plans: '/plans',
  card_products: '/card-products',
  kyc: '/kyc',
  disputes: '/disputes/all',
  internal_users: '/internal-users',
  transactions: '/admin/transactions',
  audit_logs: '/admin/audit-logs',
  cards: '/admin/cards',
  ledger_accounts: '/admin/ledger-accounts',
}

function pathFor(resource: string) {
  const path = RESOURCE_PATH[resource]
  if (!path) throw new Error(`Unknown resource: ${resource}`)
  return path
}

function applyFilters<T extends Record<string, any>>(records: T[], filter: Record<string, any>) {
  const entries = Object.entries(filter || {}).filter(([, v]) => v !== undefined && v !== '')
  if (entries.length === 0) return records
  return records.filter((record) =>
    entries.every(([key, value]) => {
      const fieldValue = record[key]
      if (key === 'q') {
        const haystack = JSON.stringify(record).toLowerCase()
        return haystack.includes(String(value).toLowerCase())
      }
      if (typeof fieldValue === 'string' && typeof value === 'string') {
        return fieldValue.toLowerCase().includes(value.toLowerCase())
      }
      return fieldValue === value
    })
  )
}

function applySort<T extends Record<string, any>>(records: T[], field?: string, order?: string) {
  if (!field) return records
  const sorted = [...records].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av === bv) return 0
    if (av === undefined || av === null) return -1
    if (bv === undefined || bv === null) return 1
    return av > bv ? 1 : -1
  })
  return order === 'DESC' ? sorted.reverse() : sorted
}

// kyc, disputes and ledger_accounts list endpoints accept these as real query-string filters
// server-side; every other filter key on those resources still falls back to the client-side
// applyFilters above (client-side pagination too — these three stay in the "small list" group).
const SERVER_FILTER_KEYS: Record<string, string[]> = {
  kyc: ['status', 'subject_type'],
  disputes: ['status', 'raised_by_type'],
  ledger_accounts: ['owner_type'],
}

// admin/transactions, admin/audit-logs, admin/cards paginate for real — see each controller's
// doc comment in app/controllers/admin/*.ts. getList forwards page/perPage/filters as query
// params and trusts the server's `meta.total`, instead of pulling everything client-side.
const PAGINATED_RESOURCES = new Set(['transactions', 'audit_logs', 'cards'])

async function fetchList(resource: string, filter: Record<string, any> = {}) {
  const serverKeys = SERVER_FILTER_KEYS[resource] || []
  const query = new URLSearchParams()
  for (const key of serverKeys) {
    if (filter[key]) query.set(key, filter[key])
  }
  const qs = query.toString()
  return apiFetch<any[]>(`${pathFor(resource)}${qs ? `?${qs}` : ''}`)
}

/**
 * Transforme les données d'un formulaire en `FormData` dès qu'il porte un fichier.
 *
 * react-admin remet un `ImageInput` sous la forme `{ rawFile: File, ... }`. Envoyé en JSON, cet
 * objet arrive au serveur comme `{}` : le fichier disparaît sans la moindre erreur. La présence
 * d'un `rawFile` fait donc basculer la requête en multipart — `apiFetch` laisse déjà la
 * plateforme écrire elle-même l'en-tête et sa frontière.
 *
 * Renvoie `null` quand il n'y a aucun fichier : les autres ressources continuent en JSON.
 */
function toFormDataIfFile(data: Record<string, unknown>): FormData | null {
  const fileEntries = Object.entries(data).filter(
    ([, value]) =>
      typeof value === 'object' && value !== null && 'rawFile' in (value as object)
  )
  if (fileEntries.length === 0) return null

  const form = new FormData()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const asFile = value as { rawFile?: File } | null
    if (asFile && typeof asFile === 'object' && asFile.rawFile) {
      form.append(key, asFile.rawFile)
    } else if (value === null) {
      // Une valeur nulle explicite doit traverser : c'est ainsi qu'on retire un plafond.
      form.append(key, '')
    } else {
      form.append(key, String(value))
    }
  }
  return form
}

export const dataProvider: DataProvider = {
  async getList<RecordType extends RaRecord = any>(resource: string, params: GetListParams) {
    if (PAGINATED_RESOURCES.has(resource)) {
      const { page, perPage } = params.pagination || { page: 1, perPage: 25 }
      const query = new URLSearchParams()
      query.set('page', String(page))
      query.set('limit', String(perPage))
      if (params.sort?.field) {
        query.set('sort', params.sort.field)
        query.set('order', params.sort.order || 'DESC')
      }
      for (const [key, value] of Object.entries(params.filter || {})) {
        if (value !== undefined && value !== '') query.set(key, String(value))
      }
      const envelope = await apiFetchEnvelope<{ data: RecordType[]; meta: { total: number } }>(
        `${pathFor(resource)}?${query.toString()}`
      )
      return { data: envelope.data, total: envelope.meta.total }
    }

    const all = await fetchList(resource, params.filter)
    const serverKeys = SERVER_FILTER_KEYS[resource] || []
    const remainingFilter = Object.fromEntries(
      Object.entries(params.filter || {}).filter(([k]) => !serverKeys.includes(k))
    )
    const filtered = applyFilters(all, remainingFilter)
    const sorted = applySort(filtered, params.sort?.field, params.sort?.order)
    const { page, perPage } = params.pagination || { page: 1, perPage: 1000 }
    const start = (page - 1) * perPage
    const pageData = sorted.slice(start, start + perPage)
    return { data: pageData as RecordType[], total: sorted.length }
  },

  async getOne<RecordType extends RaRecord = any>(resource: string, params: { id: RecordType['id'] }) {
    const data = await apiFetch<RecordType>(`${pathFor(resource)}/${params.id}`)
    return { data }
  },

  async getMany<RecordType extends RaRecord = any>(resource: string, params: { ids: RecordType['id'][] }) {
    const results = await Promise.all(
      params.ids.map((id) => apiFetch<RecordType>(`${pathFor(resource)}/${id}`))
    )
    return { data: results }
  },

  async getManyReference<RecordType extends RaRecord = any>(
    resource: string,
    params: {
      target: string
      id: unknown
      sort?: { field: string; order: string }
      pagination: { page: number; perPage: number }
    }
  ) {
    const all = await fetchList(resource)
    const filtered = all.filter((r) => r[params.target] === params.id)
    const sorted = applySort(filtered, params.sort?.field, params.sort?.order)
    const { page, perPage } = params.pagination
    const start = (page - 1) * perPage
    return { data: sorted.slice(start, start + perPage) as RecordType[], total: sorted.length }
  },

  async create<RecordType extends Omit<RaRecord, 'id'> = any, ResultRecordType extends RaRecord = RecordType & { id: RaRecord['id'] }>(
    resource: string,
    params: { data: Partial<RecordType> }
  ) {
    const form = toFormDataIfFile(params.data as Record<string, unknown>)
    const data = await apiFetch<ResultRecordType>(pathFor(resource), {
      method: 'POST',
      body: form ?? JSON.stringify(params.data),
    })
    return { data }
  },

  async update<RecordType extends RaRecord = any>(
    resource: string,
    params: { id: RecordType['id']; data: Partial<RecordType>; previousData: RecordType }
  ) {
    const form = toFormDataIfFile(params.data as Record<string, unknown>)
    const data = await apiFetch<Partial<RecordType>>(`${pathFor(resource)}/${params.id}`, {
      method: 'PATCH',
      body: form ?? JSON.stringify(params.data),
    })
    return { data: { ...params.previousData, ...data } as RecordType }
  },

  async updateMany(resource: string, params: { ids: RaRecord['id'][]; data: Record<string, unknown> }) {
    await Promise.all(
      params.ids.map((id) =>
        apiFetch(`${pathFor(resource)}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(params.data),
        })
      )
    )
    return { data: params.ids }
  },

  async delete<RecordType extends RaRecord = any>(
    resource: string,
    params: { id: RecordType['id']; previousData?: RecordType }
  ) {
    await apiFetch(`${pathFor(resource)}/${params.id}`, { method: 'DELETE' })
    return { data: params.previousData as RecordType }
  },

  async deleteMany(resource: string, params: { ids: RaRecord['id'][] }) {
    await Promise.all(
      params.ids.map((id) => apiFetch(`${pathFor(resource)}/${id}`, { method: 'DELETE' }))
    )
    return { data: params.ids }
  },
}

/**
 * Every lifecycle/moderation action in this API (approve, suspend, close a dispute, freeze a
 * wallet, ...) is its own POST/PATCH endpoint rather than a generic update — none of it fits
 * react-admin's CRUD verbs, so it's exposed separately here and called directly from action
 * buttons via useDataProvider() rather than through update()/create().
 */
export const adminActions = {
  agentApprove: (id: number | string) => apiFetch(`/agents/${id}/approve`, { method: 'POST' }),
  agentActivate: (id: number | string) => apiFetch(`/agents/${id}/activate`, { method: 'POST' }),
  agentSuspend: (id: number | string, reason: string) =>
    apiFetch(`/agents/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  agentDeactivate: (id: number | string, reason: string) =>
    apiFetch(`/agents/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) }),

  businessApprove: (id: number | string) =>
    apiFetch(`/businesses/${id}/approve`, { method: 'POST' }),
  businessActivate: (id: number | string) =>
    apiFetch(`/businesses/${id}/activate`, { method: 'POST' }),
  businessSuspend: (id: number | string, reason: string) =>
    apiFetch(`/businesses/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  businessDeactivate: (id: number | string, reason: string) =>
    apiFetch(`/businesses/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  businessAssignPlan: (id: number | string, planId: number) =>
    apiFetch(`/businesses/${id}/plan`, { method: 'POST', body: JSON.stringify({ plan_id: planId }) }),
  businessIssueApiKey: (id: number | string) =>
    apiFetch<{ key_id: string; api_key: string; message: string }>(`/businesses/${id}/api-keys`, {
      method: 'POST',
    }),
  businessRevokeApiKey: (id: number | string, keyId: number | string) =>
    apiFetch(`/businesses/${id}/api-keys/${keyId}`, { method: 'DELETE' }),

  userResetPin: (id: number | string) => apiFetch(`/users/${id}/pin/reset`, { method: 'POST' }),
  userFreezeWallet: (id: number | string, walletId: number | string, reason: string) =>
    apiFetch(`/users/${id}/wallets/${walletId}/freeze`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  userUnfreezeWallet: (id: number | string, walletId: number | string) =>
    apiFetch(`/users/${id}/wallets/${walletId}/unfreeze`, { method: 'POST' }),

  planArchive: (id: number | string) => apiFetch(`/plans/${id}/archive`, { method: 'POST' }),
  cardProductArchive: (id: number | string) =>
    apiFetch(`/card-products/${id}/archive`, { method: 'POST' }),
  cardProductClearImage: (id: number | string) =>
    apiFetch(`/card-products/${id}/image`, { method: 'DELETE' }),
  disputeMessages: (id: number | string) =>
    apiFetch<
      Array<{
        id: number
        author_type: string
        mine: boolean
        body: string
        created_at: string
      }>
    >(`/disputes/all/${id}/messages`),
  disputeReply: (id: number | string, body: string) =>
    apiFetch(`/disputes/all/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  kycApprove: (id: number | string) => apiFetch(`/kyc/${id}/approve`, { method: 'POST' }),
  kycReject: (id: number | string, reason: string) =>
    apiFetch(`/kyc/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  kycDocuments: (id: number | string) =>
    apiFetch<{ id: number; document_type: string; created_at: string }[]>(
      `/kyc/${id}/documents`
    ),

  disputeClose: (id: number | string, outcome: 'approved' | 'rejected', resolutionNotes: string) =>
    apiFetch(`/disputes/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ outcome, resolution_notes: resolutionNotes }),
    }),

  internalUserActivate: (id: number | string) =>
    apiFetch(`/internal-users/${id}/activate`, { method: 'POST' }),
  internalUserSuspend: (id: number | string, reason: string) =>
    apiFetch(`/internal-users/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  internalUserDeactivate: (id: number | string, reason: string) =>
    apiFetch(`/internal-users/${id}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  internalUserResetPassword: (id: number | string) =>
    apiFetch<{ new_password: string; message: string }>(`/internal-users/${id}/reset-password`, {
      method: 'POST',
    }),

  cardFreeze: (id: number | string) => apiFetch(`/admin/cards/${id}/freeze`, { method: 'POST' }),
  cardUnfreeze: (id: number | string) => apiFetch(`/admin/cards/${id}/unfreeze`, { method: 'POST' }),
  cardTerminate: (id: number | string, reason: string) =>
    apiFetch(`/admin/cards/${id}/terminate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cardTopup: (id: number | string, amount: string) =>
    apiFetch<{ id: number; balance: string; status: string }>(`/admin/cards/${id}/topup`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
  cardTransactions: (id: number | string) =>
    apiFetch<
      Array<{ transactionId: string; amount: string; description: string; createdAt: string }>
    >(`/admin/cards/${id}/transactions`),

  balanceSheet: (currency: string) =>
    apiFetch<{
      currency_code: string
      assets: string
      liabilities: string
      equity: string
      revenue: string
      expense: string
      balanced: boolean
    }>(`/admin/accounting/balance-sheet?currency=${currency}`),
  accountingRevenue: (currency: string, dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams({ currency })
    if (dateFrom) q.set('date_from', dateFrom)
    if (dateTo) q.set('date_to', dateTo)
    return apiFetch<{
      currency_code: string
      total: string
      by_account: { code: string; name: string; total: string; entry_count: number }[]
    }>(`/admin/accounting/revenue?${q.toString()}`)
  },
  reconcile: () =>
    apiFetch<{
      walletsChecked: number
      walletMismatches: { walletId: number; expected: string; actual: string }[]
      balancedByCurrency: Record<string, boolean>
      totalsByCurrency: Record<string, { debits: string; credits: string }>
    }>('/admin/accounting/reconcile', { method: 'POST' }),
}
