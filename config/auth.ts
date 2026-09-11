import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

const authConfig = defineConfig({
  /**
   * Default guard used when no guard is explicitly specified.
   */
  default: 'api',

  guards: {
    /**
     * Token-based guard for stateless API authentication (client users/agents).
     */
    api: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
    }),

    /**
     * Session-based guard for browser authentication.
     */
    web: sessionGuard({
      /**
       * Enable persistent login using remember-me tokens.
       */
      useRememberMeTokens: false,

      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
    }),

    /**
     * Token-based guard for internal staff (support, compliance, finance, admin).
     * Uses shorter token TTL and MFA requirement.
     */
    internal: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/internal_user'),
      }),
    }),

    /**
     * Token-based guard for the business dashboard (human login, email+password) — distinct
     * from businessApiKeyMiddleware, which authenticates server-to-server calls via API key.
     */
    businessDashboard: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/business'),
      }),
    }),
  },
})

export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
