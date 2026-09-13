import type { HttpContext } from '@adonisjs/core/http'
import InternalUser from '#models/internal_user'
import { hasFullInternalSession } from '#services/staff/internal_session_policy'

/**
 * Gate for every admin console endpoint. Beyond "is this an internal user", the account must be
 * active, fully signed in (password + TOTP when enabled), have replaced its temporary password,
 * and have two-factor authentication enrolled. The `code` field lets the admin panel send the
 * staff member to the right step instead of treating the refusal as an expired session.
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

    if (user.status !== 'active') {
      return ctx.response.forbidden({ code: 'ACCOUNT_INACTIVE', message: `Account is ${user.status}` })
    }

    if (!hasFullInternalSession(user)) {
      return ctx.response.forbidden({ code: 'MFA_REQUIRED', message: 'Two-factor verification required' })
    }

    if (user.mustChangePassword) {
      return ctx.response.forbidden({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your temporary password before using the admin console',
      })
    }

    if (!user.mfaEnabled) {
      return ctx.response.forbidden({
        code: 'MFA_ENROLLMENT_REQUIRED',
        message: 'Enable two-factor authentication before using the admin console',
      })
    }

    await next()
  }
}
