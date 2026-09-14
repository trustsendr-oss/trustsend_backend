import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SandboxMode } from '#services/sandbox/sandbox_mode'

/**
 * Hides sandbox-only tooling (test funding, ...) outside APP_MODE=sandbox. The routes stay
 * registered in every environment and are refused per request, so the check follows the live
 * env value rather than whatever it was when routes were loaded. The message is explicit rather
 * than a bare 404: these endpoints are documented, so there is nothing to hide, and it tells an
 * integrator who called production by mistake what went wrong.
 */
export default class SandboxOnlyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!SandboxMode.isEnabled()) {
      return ctx.response.notFound({ message: 'This endpoint is only available in the sandbox' })
    }

    return next()
  }
}
