import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

const allowedOrigins = env
  .get('CORS_ALLOWED_ORIGINS', '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * In development, allow every origin to simplify local front/backend setup — reflecting the
   * request's own Origin is spec-compliant with `credentials: true` (only a literal `"*"` isn't).
   * In production, keep an explicit allowlist via CORS_ALLOWED_ORIGINS (empty by default, so no
   * cross-origin browser access — including cookie-based admin/business dashboard logins — works
   * until configured).
   */
  origin: app.inDev ? true : allowedOrigins,

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   */
  exposeHeaders: [],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds.
   */
  maxAge: 90,
})

export default corsConfig
