import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import Business from '#models/business'

/**
 * Runs AFTER middleware.auth({ guards: ['businessDashboard'] }) authenticates a human dashboard
 * session. Copies the authenticated Business onto ctx.business — the same property
 * business_api_key_middleware.ts sets for server-to-server calls — so every app/controllers/business/*
 * controller (deposits, payouts, wallet, transactions, webhooks) works unchanged for both access
 * paths without any duplicated logic.
 */
export default class BusinessDashboardMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const business = ctx.auth.user
    if (!(business instanceof Business)) {
      return ctx.response.unauthorized({ message: 'Unauthenticated' })
    }

    ctx.business = business
    ctx.businessAuthMethod = 'dashboard'

    return next()
  }
}
