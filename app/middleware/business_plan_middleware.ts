import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { PlanService } from '#services/business/plan_service'

/**
 * Gates a business-facing route on a plan feature key — runs AFTER businessApiKey()/
 * businessDashboard() (ctx.business must already be set) and typically after businessActive().
 * Usage: middleware.businessPlan('mobile_money.payouts') on any route in the businessApiKey or
 * business/dashboard route groups.
 *
 * Deliberately does not distinguish API-key vs dashboard callers — the plan gates the BUSINESS,
 * not how it authenticated, and both access paths share the same controllers for this reason
 * (see business_dashboard_middleware.ts's comment).
 *
 * Currency AND country scoping both work the same way: read straight off the request via
 * ctx.request.input() (checks query string AND body) BEFORE the controller's own validator runs,
 * so a plan can restrict a feature to specific currencies/countries (see app/models/plan.ts
 * hasFeature()). Deliberately NOT derived from anything else (KYC data, an async PawaPay config
 * lookup, etc.) — the restriction is driven entirely by the plan plus whatever the caller
 * self-declares in `country_code`/`currency_code`, with zero extra network calls or dependencies
 * on other subsystems. This means the restriction is only as good as what the caller sends: a
 * validator that doesn't accept/require `country_code` for a given route leaves that dimension
 * unenforceable there (see e.g. app/validators/mobile_money.ts, which does accept it).
 */
export default class BusinessPlanMiddleware {
  async handle(ctx: HttpContext, next: NextFn, featureKey: string) {
    await ctx.business.load('plan')

    const currencyCode = ctx.request.input('currency_code') as string | undefined
    const countryCode = ctx.request.input('country_code') as string | undefined

    if (!PlanService.hasFeature(ctx.business, featureKey, { currencyCode, countryCode })) {
      const scopeSuffix = [currencyCode, countryCode].filter(Boolean).join('/')
      return ctx.response.forbidden({
        message: `Your current plan (${ctx.business.plan?.name ?? 'none'}) does not include this feature${scopeSuffix ? ` for ${scopeSuffix}` : ''}: ${featureKey}. Contact support to upgrade.`,
      })
    }

    return next()
  }
}
