import { DateTime } from 'luxon'
import { v4 as uuidv4 } from 'uuid'
import db from '@adonisjs/lucid/services/db'
import Plan, { type PlanFeatures, type PlanFeatureContext } from '#models/plan'
import Business from '#models/business'
import Wallet from '#models/wallet'
import LedgerTransaction from '#models/ledger_transaction'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { SandboxMode } from '#services/sandbox/sandbox_mode'

export class PlanNotFoundException extends Error {
  constructor() {
    super('Plan not found')
    this.name = 'PlanNotFoundException'
  }
}

export class PlanCodeTakenException extends Error {
  constructor(code: string) {
    super(`Plan code "${code}" is already in use`)
    this.name = 'PlanCodeTakenException'
  }
}

export class InvalidPlanFeaturesException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPlanFeaturesException'
  }
}

/**
 * The `features` shape (true | { currencies?, countries? } per key) is a union vine's schema
 * builder isn't a natural fit for at the record-value level — validated by hand here instead,
 * same as this codebase already does for free-form `metadata` fields elsewhere. Called from both
 * create() and update() so the two can't drift into accepting different shapes.
 *
 * @throws InvalidPlanFeaturesException on any malformed entry.
 */
function assertValidPlanFeatures(features: unknown): asserts features is PlanFeatures {
  if (typeof features !== 'object' || features === null || Array.isArray(features)) {
    throw new InvalidPlanFeaturesException(
      'features must be an object mapping each feature key to `true` or a restriction object'
    )
  }

  for (const [key, value] of Object.entries(features)) {
    if (value === true) continue

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new InvalidPlanFeaturesException(
        `features["${key}"] must be \`true\` or an object like { currencies: [...], countries: [...] }`
      )
    }

    for (const dimension of ['currencies', 'countries'] as const) {
      const list = (value as Record<string, unknown>)[dimension]
      if (list === undefined) continue
      if (!Array.isArray(list) || !list.every((v) => typeof v === 'string')) {
        throw new InvalidPlanFeaturesException(`features["${key}"].${dimension} must be an array of strings`)
      }
    }

    const allowedKeys = new Set(['currencies', 'countries'])
    for (const innerKey of Object.keys(value)) {
      if (!allowedKeys.has(innerKey)) {
        throw new InvalidPlanFeaturesException(`features["${key}"] has unknown key "${innerKey}"`)
      }
    }
  }
}

export class PlanWalletMissingException extends Error {
  constructor(currencyCode: string) {
    super(`Business has no ${currencyCode} wallet to pay this plan's fee — create one first`)
    this.name = 'PlanWalletMissingException'
  }
}

export class InsufficientPlanBalanceException extends Error {
  constructor() {
    super('Insufficient wallet balance to pay this plan fee')
    this.name = 'InsufficientPlanBalanceException'
  }
}

export class PlanAlreadyActiveException extends Error {
  constructor() {
    super('Business is already subscribed to this plan')
    this.name = 'PlanAlreadyActiveException'
  }
}

export class PlanDowngradeNotAllowedException extends Error {
  constructor() {
    super(
      'Cannot self-service switch to a plan that is not strictly higher-priced through subscribe() — the one-time price pays for moving UP a tier, so charging it for a same-price or cheaper plan would be paying to lose or merely swap features. Contact support, or use PlanService.assignToBusiness() (admin override, no charge) instead.'
    )
    this.name = 'PlanDowngradeNotAllowedException'
  }
}

/**
 * Admin-managed pricing tiers that gate which business-facing APIs a Business may call — see
 * business_plan_middleware.ts for enforcement and the feature keys actually checked today. Also
 * owns the money side: subscribe() charges the plan's one-time price, and
 * chargeDueMaintenanceFees() charges its recurring monthly price — both come out of the
 * business's own wallet in the plan's currency, same ledger machinery as mobile money
 * deposits/payouts (MOBILE_MONEY_CLEARING's sibling here is PLAN_SUBSCRIPTION_FEES).
 */
export class PlanService {
  static async list(): Promise<Plan[]> {
    return Plan.query().orderBy('id', 'asc')
  }

  static async findByIdOrFail(id: number): Promise<Plan> {
    const plan = await Plan.find(id)
    if (!plan) throw new PlanNotFoundException()
    return plan
  }

  static async create(
    request: {
      code: string
      name: string
      description?: string
      features: PlanFeatures
      price?: bigint
      maintenancePrice?: bigint
      currencyCode?: string
    },
    actorId: number,
    correlationId: string
  ): Promise<Plan> {
    assertValidPlanFeatures(request.features)

    const existing = await Plan.query().where('code', request.code).first()
    if (existing) throw new PlanCodeTakenException(request.code)

    const plan = await Plan.create({
      code: request.code,
      name: request.name,
      description: request.description ?? null,
      features: request.features,
      price: request.price ?? 0n,
      maintenancePrice: request.maintenancePrice ?? 0n,
      currencyCode: request.currencyCode ?? 'USD',
      status: 'active',
    })

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'plan.created',
      resourceType: 'plan',
      resourceId: plan.id,
      before: undefined,
      after: {
        code: plan.code,
        features: plan.features,
        price: plan.price.toString(),
        maintenance_price: plan.maintenancePrice.toString(),
        currency_code: plan.currencyCode,
      },
      correlationId,
    })

    return plan
  }

  static async update(
    id: number,
    request: {
      name?: string
      description?: string
      features?: PlanFeatures
      price?: bigint
      maintenancePrice?: bigint
    },
    actorId: number,
    correlationId: string
  ): Promise<Plan> {
    if (request.features !== undefined) {
      assertValidPlanFeatures(request.features)
    }

    const plan = await this.findByIdOrFail(id)
    const before = {
      name: plan.name,
      description: plan.description,
      features: plan.features,
      price: plan.price.toString(),
      maintenance_price: plan.maintenancePrice.toString(),
    }

    if (request.name !== undefined) plan.name = request.name
    if (request.description !== undefined) plan.description = request.description
    if (request.features !== undefined) plan.features = request.features
    if (request.price !== undefined) plan.price = request.price
    if (request.maintenancePrice !== undefined) plan.maintenancePrice = request.maintenancePrice
    await plan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'plan.updated',
      resourceType: 'plan',
      resourceId: plan.id,
      before,
      after: {
        name: plan.name,
        description: plan.description,
        features: plan.features,
        price: plan.price.toString(),
        maintenance_price: plan.maintenancePrice.toString(),
      },
      correlationId,
    })

    return plan
  }

  static async archive(id: number, actorId: number, correlationId: string): Promise<Plan> {
    const plan = await this.findByIdOrFail(id)
    plan.status = 'archived'
    await plan.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'plan.archived',
      resourceType: 'plan',
      resourceId: plan.id,
      before: { status: 'active' },
      after: { status: 'archived' },
      correlationId,
    })

    return plan
  }

  /**
   * Admin override: assigns a plan to a business for FREE — no charge, unlike subscribe() below.
   * Meant for support/comp cases. Still resets the maintenance billing schedule so the new
   * plan's recurring fee (if any) starts being charged on schedule, same as a real subscribe.
   */
  static async assignToBusiness(
    businessId: number,
    planId: number,
    actorId: number,
    correlationId: string
  ): Promise<Business> {
    const business = await Business.findOrFail(businessId)
    const plan = await this.findByIdOrFail(planId)
    const before = { plan_id: business.planId }

    business.planId = plan.id
    business.planSubscribedAt = DateTime.now()
    business.planNextMaintenanceBillingAt = plan.maintenancePrice > 0n ? DateTime.now().plus({ months: 1 }) : null
    business.planPaymentStatus = 'current'
    await business.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'business.plan_assigned',
      resourceType: 'business',
      resourceId: business.id,
      before,
      after: { plan_id: plan.id, plan_code: plan.code },
      correlationId,
    })

    return business
  }

  /**
   * Self-service subscribe: business pays the plan's one-time `price` (if any) right now, out of
   * its own wallet in the plan's currency, then the plan takes effect immediately. If the plan
   * also has a `maintenancePrice`, this schedules the first recurring charge for one month out —
   * see chargeDueMaintenanceFees() for how that gets collected.
   *
   * Only allows moving to a strictly higher-tier plan (by price) than whatever the business is
   * currently on — see PlanAlreadyActiveException / PlanDowngradeNotAllowedException. A first-
   * time subscribe (no current plan) accepts any plan.
   *
   * Throws PlanWalletMissingException if the business has no wallet in the plan's currency yet,
   * or InsufficientPlanBalanceException if it does but can't cover the price. All of these are
   * caller-facing conditions (map to 4xx), not bugs.
   *
   * ALWAYS posts a LedgerTransaction (type `business_plan_subscription`, `initiatedByType:
   * 'business'`) — even for a free plan (price 0), with an empty entries array: postTransaction()
   * happily creates a zero-entry "envelope" transaction, since 0 debits == 0 credits. This is
   * deliberate: the business needs a durable, visible record of the plan change (it shows up in
   * GET business/transactions the same way deposits/payouts do) and a hook to notify from —
   * without it, a free-plan subscribe was previously silent: no transaction, no webhook, no
   * in-app notification, because notifyBusinessWebhook() no-ops unless initiatedByType==='business'
   * and there was nothing to attach a notification to at all.
   */
  static async subscribe(businessId: number, planId: number, correlationId: string): Promise<Business> {
    const { business, posted, plan } = await db.transaction(async (trx) => {
      const business = await Business.query({ client: trx })
        .where('id', businessId)
        .preload('plan')
        .forUpdate()
        .firstOrFail()
      const plan = await Plan.query({ client: trx }).where('id', planId).first()
      if (!plan || plan.status !== 'active') throw new PlanNotFoundException()

      // Tier is ranked by price (same ordering the catalogue endpoint uses) — the only signal
      // we have for "higher" vs "lower". Re-subscribing to the current plan, or moving to a
      // plan that is the same price or cheaper, would still charge the new plan's full price for
      // a lateral or backward move — which makes no sense for a one-time "move up a tier" fee
      // (a same-price plan swap is not an upgrade just because the plan id differs). A business
      // with no plan yet has nothing to compare against, so any plan is a valid first subscribe.
      if (business.plan) {
        if (business.plan.id === plan.id) throw new PlanAlreadyActiveException()
        if (plan.price <= business.plan.price) throw new PlanDowngradeNotAllowedException()
      }

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = []

      if (plan.price > 0n) {
        const wallet = await Wallet.query({ client: trx })
          .where('business_id', businessId)
          .where('currency_code', plan.currencyCode)
          .forUpdate()
          .first()

        if (!wallet) throw new PlanWalletMissingException(plan.currencyCode)
        if (wallet.balanceCache < plan.price) throw new InsufficientPlanBalanceException()

        const revenueAccount = await LedgerService.getOrCreatePlatformAccount(
          `PLAN_SUBSCRIPTION_FEES.${plan.currencyCode}`,
          `Plan Subscription Fees (${plan.currencyCode})`,
          plan.currencyCode,
          trx,
          'revenue'
        )

        entries.push(
          { accountId: wallet.ledgerAccountId, direction: 'debit', amount: new Money(plan.price, plan.currencyCode) },
          { accountId: revenueAccount.id, direction: 'credit', amount: new Money(plan.price, plan.currencyCode) }
        )
      }

      const posted = await LedgerService.postTransaction(
        'business_plan_subscription',
        entries,
        'business',
        businessId,
        {
          correlationId,
          description: `Subscription to plan ${plan.code}`,
          metadata: {
            plan_id: plan.id,
            plan_code: plan.code,
            price: plan.price.toString(),
            currency_code: plan.currencyCode,
          },
          amount: new Money(plan.price, plan.currencyCode),
          paymentMethod: 'wallet',
          paymentChannel: plan.code,
          trx,
        }
      )

      const before = { plan_id: business.planId, plan_payment_status: business.planPaymentStatus }

      business.planId = plan.id
      business.planSubscribedAt = DateTime.now()
      business.planNextMaintenanceBillingAt = plan.maintenancePrice > 0n ? DateTime.now().plus({ months: 1 }) : null
      business.planPaymentStatus = 'current'
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: businessId,
        action: 'business.plan_subscribed',
        resourceType: 'business',
        resourceId: business.id,
        before,
        after: { plan_id: plan.id, plan_code: plan.code, price_charged: plan.price.toString() },
        correlationId,
        trx,
      })

      await notifyBusinessWebhook(posted, 'business.plan_subscribed', trx)

      return { business, posted, plan }
    })

    await InAppNotificationService.notify({
      recipientType: 'business',
      recipientId: businessId,
      type: 'business.plan_subscribed',
      title: 'Plan subscription confirmed',
      message:
        plan.price > 0n
          ? `You are now on the ${plan.name} plan — ${plan.price} ${plan.currencyCode} was charged to your wallet.`
          : `You are now on the ${plan.name} plan.`,
      data: { transaction_id: posted.id, plan_id: plan.id },
    })

    return business
  }

  /**
   * Charges every business whose plan_next_maintenance_billing_at is due. Meant to run daily via
   * an external cron calling `node ace plans:bill-maintenance` — see commands/bill_plan_maintenance.ts.
   *
   * On success: advances the schedule by one month, posts a `business_plan_maintenance_fee`
   * LedgerTransaction (initiatedByType: 'business', so it shows up in GET business/transactions
   * and triggers the business's webhook the same way a deposit/payout does), and sends an in-app
   * notification.
   * On insufficient balance: marks plan_payment_status='past_due' and leaves the due date in the
   * past, so the NEXT run retries immediately (simple dunning-by-retry — no grace period or
   * auto-downgrade is implemented; a past_due business keeps its plan and features until it pays
   * or an admin intervenes). Also posts a `failed`-status tracking LedgerTransaction (no entries —
   * nothing was actually moved) purely so the business can see the failed attempt in its history
   * and gets notified — this is the one notification that matters most here, since a business that
   * never finds out its payment failed has no reason to top up before it happens again.
   */
  static async chargeDueMaintenanceFees(): Promise<{ charged: number; pastDue: number }> {
    const due = await Business.query()
      .whereNotNull('plan_next_maintenance_billing_at')
      .where('plan_next_maintenance_billing_at', '<=', DateTime.now().toJSDate())
      .preload('plan')

    let charged = 0
    let pastDue = 0

    for (const business of due) {
      const plan = business.plan
      if (!plan || plan.maintenancePrice <= 0n) continue

      const correlationId = `plan-maintenance-${business.id}-${Date.now()}`

      try {
        const posted = await db.transaction(async (trx) => {
          const wallet = await Wallet.query({ client: trx })
            .where('business_id', business.id)
            .where('currency_code', plan.currencyCode)
            .forUpdate()
            .first()

          if (!wallet || wallet.balanceCache < plan.maintenancePrice) {
            throw new InsufficientPlanBalanceException()
          }

          const revenueAccount = await LedgerService.getOrCreatePlatformAccount(
            `PLAN_SUBSCRIPTION_FEES.${plan.currencyCode}`,
            `Plan Subscription Fees (${plan.currencyCode})`,
            plan.currencyCode,
            trx,
            'revenue'
          )

          const posted = await LedgerService.postTransaction(
            'business_plan_maintenance_fee',
            [
              { accountId: wallet.ledgerAccountId, direction: 'debit', amount: new Money(plan.maintenancePrice, plan.currencyCode) },
              { accountId: revenueAccount.id, direction: 'credit', amount: new Money(plan.maintenancePrice, plan.currencyCode) },
            ],
            'business',
            business.id,
            {
              correlationId,
              description: `Monthly maintenance fee for plan ${plan.code}`,
              metadata: { plan_id: plan.id, plan_code: plan.code },
              amount: new Money(plan.maintenancePrice, plan.currencyCode),
              paymentMethod: 'wallet',
              paymentChannel: plan.code,
              trx,
            }
          )

          business.planNextMaintenanceBillingAt = business.planNextMaintenanceBillingAt!.plus({ months: 1 })
          business.planPaymentStatus = 'current'
          await business.useTransaction(trx).save()

          await notifyBusinessWebhook(posted, 'business.plan_maintenance_charged', trx)

          return posted
        })

        await InAppNotificationService.notify({
          recipientType: 'business',
          recipientId: business.id,
          type: 'business.plan_maintenance_charged',
          title: 'Plan maintenance fee charged',
          message: `${plan.maintenancePrice} ${plan.currencyCode} was charged for your ${plan.name} plan's monthly fee.`,
          data: { transaction_id: posted.id, plan_id: plan.id },
        })

        charged++
      } catch {
        business.planPaymentStatus = 'past_due'
        await business.save()

        await AuditLoggerService.record({
          actorType: 'system',
          actorId: 0,
          action: 'business.plan_maintenance_fee_failed',
          resourceType: 'business',
          resourceId: business.id,
          before: { plan_payment_status: 'current' },
          after: { plan_payment_status: 'past_due' },
          correlationId,
        })

        const failedTxn = new LedgerTransaction()
        failedTxn.id = IdGenerator.generateTransactionId()
        failedTxn.uuid = uuidv4()
        failedTxn.type = 'business_plan_maintenance_fee'
        failedTxn.status = 'failed'
        failedTxn.initiatedByType = 'business'
        failedTxn.initiatedById = business.id
        failedTxn.correlationId = correlationId
        failedTxn.description = `Monthly maintenance fee for plan ${plan.code} failed — insufficient wallet balance`
        failedTxn.metadata = { plan_id: plan.id, plan_code: plan.code, reason: 'insufficient_balance' }
        await failedTxn.save()

        await notifyBusinessWebhook(failedTxn, 'business.plan_payment_failed')

        await InAppNotificationService.notify({
          recipientType: 'business',
          recipientId: business.id,
          type: 'business.plan_payment_failed',
          title: 'Plan payment failed',
          message: `We couldn't charge ${plan.maintenancePrice} ${plan.currencyCode} for your ${plan.name} plan — insufficient wallet balance. Top up to avoid losing access.`,
          data: { transaction_id: failedTxn.id, plan_id: plan.id },
        })

        pastDue++
      }
    }

    return { charged, pastDue }
  }

  /**
   * Whether `business` may use `featureKey` (e.g. "mobile_money.payouts") — the single check
   * business_plan_middleware.ts calls on every gated route.
   *
   * Fails OPEN (returns true) when the business has no plan attached at all: every business is
   * backfilled onto the 'default' plan at rollout (see migration
   * 1788300000001_add_plan_id_to_businesses_table), so in steady state this should only trigger
   * for a misconfigured environment — and a config bug should never silently lock a paying
   * customer out of every API. Track down and fix a business with no plan rather than relying on
   * this fallback.
   *
   * Always true in the sandbox: integrators need to exercise every API before choosing a plan,
   * and the 'default' plan doesn't grant everything (e.g. cards.issuing).
   */
  static hasFeature(business: Business, featureKey: string, context?: PlanFeatureContext): boolean {
    if (SandboxMode.isEnabled()) return true
    if (!business.plan) return true
    return business.plan.hasFeature(featureKey, context)
  }
}
