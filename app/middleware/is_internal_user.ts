import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'

/**
 * Middleware to check if authenticated user is an InternalUser (Admin/Staff)
 * Blocks regular users from accessing admin endpoints
 */
export default class IsInternalUserMiddleware {
  async handle(ctx: HttpContext, next: () => Promise<void>) {
    // Bare ctx.auth.authenticate() only ever tries the default guard ('api', User) — it would
    // reject every InternalUser token outright before the instanceof check below even runs.
    // Must explicitly target the 'internal' guard.
    const user = await ctx.auth.authenticateUsing(['internal'])

    if (!(user instanceof InternalUser)) {
      return ctx.response.forbidden({
        message: 'Admin access required. Only internal users can access this resource.',
      })
    }

    await next()
  }
}
