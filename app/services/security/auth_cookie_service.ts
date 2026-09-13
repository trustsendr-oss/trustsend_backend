import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'

export const INTERNAL_ACCESS_COOKIE = 'internal_access_token'
export const INTERNAL_CSRF_COOKIE = 'internal_csrf_token'
export const BUSINESS_ACCESS_COOKIE = 'business_access_token'
export const BUSINESS_CSRF_COOKIE = 'business_csrf_token'

/**
 * Cookie-based sessions for the two browser-facing guards (internal admin, business dashboard).
 * The mobile/API-key/`api` guard keeps using a plain `Authorization: Bearer` header — cookies
 * only make sense for a browser, and forcing them on non-browser clients would break them for
 * no benefit (they aren't exposed to a page's JS/DOM the way a browser tab is).
 *
 * Two cookies per guard:
 * - `*_access_token` — httpOnly, carries the REAL access token. JS can never read it, so an XSS
 *   bug can no longer exfiltrate it wholesale the way a `localStorage`-stored token could.
 *   cookie_to_bearer_middleware.ts re-injects its value as a normal `Authorization` header
 *   before the existing tokensGuard runs, so token verification itself is untouched.
 * - `*_csrf_token` — NOT httpOnly, random value, unrelated to the access token. Since the access
 *   cookie is now sent automatically by the browser on every request (unlike a header, which
 *   only our own JS ever set), a forged cross-site request could ride on it — the classic CSRF
 *   problem a Bearer-header scheme never had. csrf_double_submit_middleware.ts requires
 *   state-changing requests to echo this cookie's value back in a header; only same-origin JS
 *   (ours) can ever read the cookie to do that.
 */
export class AuthCookieService {
  private static get secure() {
    return !app.inDev
  }

  static setSession(
    ctx: HttpContext,
    accessCookieName: string,
    csrfCookieName: string,
    token: string,
    maxAgeSeconds: number
  ): string {
    ctx.response.cookie(accessCookieName, token, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    })

    const csrfToken = randomUUID()
    // encode: false — Adonis would otherwise JSON+base64 the value, so the raw cookie would no
    // longer equal the csrf_token returned in the login body. Frontends served from another
    // subdomain cannot read this cookie and send that body value back as X-CSRF-Token, which
    // cookie_to_bearer_middleware.ts compares against the raw cookie byte-for-byte.
    ctx.response.plainCookie(csrfCookieName, csrfToken, {
      encode: false,
      httpOnly: false,
      secure: this.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    })
    return csrfToken
  }

  static clearSession(ctx: HttpContext, accessCookieName: string, csrfCookieName: string) {
    ctx.response.clearCookie(accessCookieName)
    ctx.response.clearCookie(csrfCookieName)
  }
}
