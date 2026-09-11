/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| The HTTP kernel file is used to register the middleware with the server
| or the router.
|
*/

import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
server.errorHandler(() => import('#exceptions/handler'))

/**
 * The server middleware stack runs middleware on all the HTTP
 * requests, even if there is no route registered for
 * the request URL.
 */
server.use([
  () => import('#middleware/force_json_response_middleware'),
  () => import('#middleware/container_bindings_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
])

/**
 * The router middleware stack runs middleware on all the HTTP
 * requests with a registered route.
 */
router.use([
  () => import('#middleware/correlation_id_middleware'),
  () => import('#middleware/rate_limit_middleware'),
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
  // Must run before any guard ever authenticates a request (initialize_auth_middleware below,
  // and every manual ctx.auth.authenticateUsing() call in controllers/middleware) — see
  // cookie_to_bearer_middleware.ts.
  () => import('#middleware/cookie_to_bearer_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/silent_auth_middleware'),
])

/**
 * Named middleware collection must be explicitly assigned to
 * the routes or the routes group.
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  isInternalUser: () => import('#middleware/is_internal_user'),
  businessApiKey: () => import('#middleware/business_api_key_middleware'),
  businessDashboard: () => import('#middleware/business_dashboard_middleware'),
  businessActive: () => import('#middleware/business_active_middleware'),
  businessPlan: () => import('#middleware/business_plan_middleware'),
  throttle: () => import('#middleware/throttle_middleware'),
})
