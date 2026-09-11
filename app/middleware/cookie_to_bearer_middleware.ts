import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  INTERNAL_ACCESS_COOKIE,
  INTERNAL_CSRF_COOKIE,
  BUSINESS_ACCESS_COOKIE,
  BUSINESS_CSRF_COOKIE,
} from '#services/security/auth_cookie_service'

const COOKIE_PAIRS = [
  { access: INTERNAL_ACCESS_COOKIE, csrf: INTERNAL_CSRF_COOKIE },
  { access: BUSINESS_ACCESS_COOKIE, csrf: BUSINESS_CSRF_COOKIE },
]

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Reads a cookie's value straight off the raw `Cookie` header, with zero interpretation —
 * deliberately NOT `request.plainCookie()`, which additionally JSON-unwraps/decrypts Adonis's
 * own cookie serialization format. Frontend JS reading `document.cookie` only ever sees that
 * same raw wire value (a browser never applies Adonis's app-specific unwrapping), so comparing
 * "what the browser can prove it read" against "what Adonis decoded" would almost never match —
 * both sides of the double-submit check must treat the CSRF cookie as an opaque string.
 */
function rawCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * Two jobs for the two cookie-authenticated guards (internal admin, business dashboard) — see
 * auth_cookie_service.ts's doc comment for the full design:
 *
 * 1. Bridges the httpOnly access-token cookie into a normal `Authorization: Bearer` header,
 *    since AdonisJS's tokensGuard only ever reads that header (AccessTokensGuard#getBearerToken
 *    is hardcoded, no cookie support) — this keeps the guard, and every controller using it,
 *    completely unchanged.
 * 2. Enforces the CSRF double-submit check, but ONLY for requests actually authenticating via
 *    one of these cookies — a request that already carries its own Authorization header (mobile
 *    app on the `api` guard, a business calling with its API key) never touches a browser cookie
 *    jar in the first place, so it's structurally immune to CSRF and is left alone here. This
 *    also means there's nothing to wire up per-route in start/routes.ts: every route that ends
 *    up authenticated via one of these two cookies is automatically covered, with zero risk of
 *    an admin/business route accidentally missing the check.
 */
export default class CookieToBearerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.request.header('authorization')) {
      return next()
    }

    for (const { access, csrf } of COOKIE_PAIRS) {
      const token = ctx.request.cookie(access)
      if (!token) continue

      if (!SAFE_METHODS.has(ctx.request.method())) {
        const cookieCsrf = rawCookieValue(ctx.request.header('cookie'), csrf)
        const headerCsrf = ctx.request.header('x-csrf-token')
        if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
          return ctx.response.forbidden({ message: 'Invalid or missing CSRF token' })
        }
      }

      ctx.request.request.headers.authorization = `Bearer ${token}`
      break
    }

    return next()
  }
}
