const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3330/api/v1'
const USER_KEY = 'tumaplus_admin_user'

/**
 * The access token itself lives in an httpOnly cookie the backend sets on login (see
 * auth_cookie_service.ts) — this file never sees or stores it, which is the whole point: no
 * amount of XSS can exfiltrate a token that JS was never handed in the first place. Only the
 * user's display info (name/email, not a credential) is cached here for getIdentity().
 */
export function setSession(user: unknown) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): { id: number; email: string; full_name: string } | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

/** Reads the CSRF cookie the backend pairs with the httpOnly access cookie — it's deliberately
 * NOT httpOnly (unlike the access token) so this same-origin JS can read it and echo it back as
 * a header, proving the request came from our own frontend. See auth_cookie_service.ts.
 *
 * Deliberately NOT decodeURIComponent'd: the backend compares this against the raw `Cookie`
 * header byte-for-byte (cookie_to_bearer_middleware.ts's rawCookieValue()) — it never applies
 * Adonis's own cookie decoding to it either, since a browser reading `document.cookie` couldn't
 * replicate that anyway. Both sides must treat the value as an opaque string. */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)internal_csrf_token=([^;]+)/)
  return match ? match[1] : null
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

/**
 * Every endpoint in this API replies with either `{ data }`, `{ data, meta }` (the paginated
 * admin/transactions, admin/audit-logs, admin/cards endpoints), or `{ message }` — never a bare
 * body. This does the fetch + auth cookie + non-2xx-to-ApiError handling shared by both
 * apiFetch (unwraps `.data`) and apiFetchEnvelope (keeps `.meta` too, for pagination).
 */
async function requestJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (!(options.body instanceof FormData) && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  const method = (options.method || 'GET').toUpperCase()
  if (MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' })

  let json: any = null
  const text = await res.text()
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { message: text }
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      clearSession()
    }
    const message = json?.message || json?.errors?.[0]?.message || `HTTP ${res.status}`
    throw new ApiError(message, res.status, json)
  }

  return json as T
}

/** Unwraps the `{ data }` envelope — what every non-paginated call needs. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const json = await requestJson<any>(path, options)
  return (json?.data !== undefined ? json.data : json) as T
}

/** Keeps the full `{ data, meta }` envelope — for the paginated admin endpoints. */
export async function apiFetchEnvelope<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return requestJson<T>(path, options)
}

/**
 * For binary responses (KYC document downloads) that don't follow the JSON `{ data }`/`{
 * message }` envelope apiFetch expects — see kyc_controller.ts getDocument(), which streams
 * `application/octet-stream` directly.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { credentials: 'include' })
  if (!res.ok) {
    if (res.status === 401) clearSession()
    throw new ApiError(`HTTP ${res.status}`, res.status, null)
  }
  return res.blob()
}

export { API_URL }
