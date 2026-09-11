import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Runs AFTER business_dashboard_middleware.ts (ctx.business must already be set). Gates the
 * financial/integration surface (deposits, payouts, wallet, webhooks, API keys, overview) on
 * status === 'active' — a business in pending_approval can log in (see auth_controller.ts,
 * which now allows login before approval) to complete onboarding (submit KYC, check its status,
 * view/edit profile, read notifications), but must not be able to move money or generate
 * credentials before an admin has actually approved it.
 */
export default class BusinessActiveMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.business.status !== 'active') {
      return ctx.response.forbidden({
        message: `This action requires an active business account (current status: ${ctx.business.status})`,
      })
    }

    return next()
  }
}
