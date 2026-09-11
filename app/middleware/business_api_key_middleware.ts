import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Business from '#models/business'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'

/**
 * Authenticates server-to-server business API calls via a Bearer API key — NOT the human
 * session/token guard (`middleware.auth()`). Businesses have no PIN and no interactive login;
 * the API key itself is the sole credential, verified fresh on every request (no caching of
 * key/business status) so a revocation or suspension takes effect immediately.
 */
export default class BusinessApiKeyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const header = ctx.request.header('authorization') || ''
    const presentedKey = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

    if (!presentedKey) {
      return ctx.response.unauthorized({ message: 'Missing API key' })
    }

    const business = await BusinessApiKeyService.verify(presentedKey)
    if (!business) {
      return ctx.response.unauthorized({ message: 'Invalid or revoked API key' })
    }

    ctx.business = business
    ctx.businessAuthMethod = 'api_key'

    return next()
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    business: Business
    /** Set by business_api_key_middleware.ts or business_dashboard_middleware.ts — controllers
     *  shared between both access paths (deposits, payouts) use this to gate PIN enforcement,
     *  which only applies to a human dashboard session, never to a server-to-server API key call. */
    businessAuthMethod: 'api_key' | 'dashboard'
  }
}
