import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Business from '#models/business'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import Plan from '#models/plan'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class BusinessOnboardingService {
  /**
   * Create a new business and allocate its primary wallet (USD by default).
   * Mirrors AgentOnboardingService.create — business must exist before the wallet is
   * inserted, since wallets.wallets_single_owner requires exactly one of
   * user_id/agent_id/business_id to be set at insert time.
   *
   * Also sets the dashboard login password (withAuthFinder hashes it automatically on save,
   * same as User/InternalUser) — if the admin doesn't supply one, a random one is generated
   * and returned in plain text alongside the business so the admin can hand it over once; it is
   * never stored or retrievable after this call returns.
   */
  static async create(request: {
    code: string
    name: string
    email: string
    phone: string
    correlationId: string
    password?: string
  }): Promise<{ business: Business; generatedPassword: string | null }> {
    const generatedPassword = request.password ? null : randomBytes(12).toString('base64url')

    return db.transaction(async (trx) => {
      const business = new Business()
      business.code = request.code
      business.name = request.name
      business.email = request.email
      business.phone = request.phone
      business.password = request.password || generatedPassword
      business.status = 'pending_approval'

      // Every business needs a plan for business_plan_middleware.ts to gate against — 'default'
      // (seeded in 1788300000000_create_plans_table.ts) grants every feature key that exists
      // today. PlanService.hasFeature() fails open if this lookup ever comes back empty, so a
      // missing seed here doesn't lock the new business out — but it should never actually be
      // missing outside a broken migration.
      const defaultPlan = await Plan.query({ client: trx }).where('code', 'default').first()
      business.planId = defaultPlan?.id ?? null
      // Parity with PlanService.subscribe()/assignToBusiness(): both set this whenever a
      // business is placed on a plan with a recurring fee. Without it here, a business onboarded
      // straight onto a 'default' plan that later gains a non-zero maintenancePrice would never
      // be picked up by chargeDueMaintenanceFees() (it only queries non-null due dates).
      business.planNextMaintenanceBillingAt =
        defaultPlan && defaultPlan.maintenancePrice > 0n ? DateTime.now().plus({ months: 1 }) : null
      business.planPaymentStatus = 'current'

      await business.useTransaction(trx).save()

      const account = new LedgerAccount()
      account.code = `BUSINESS_WALLET.${request.code}`
      account.name = `Wallet for business ${request.name}`
      account.accountType = 'asset'
      account.ownerType = 'business_wallet'
      account.ownerId = business.id
      account.currencyCode = 'USD'
      account.status = 'active'

      await account.useTransaction(trx).save()

      const wallet = new Wallet()
      wallet.businessId = business.id
      wallet.ledgerAccountId = account.id
      wallet.currencyCode = 'USD'
      wallet.balanceCache = 0n
      wallet.status = 'active'

      await wallet.useTransaction(trx).save()

      // owner_id must reference the wallet's own id (see user_onboarding_service.ts) — it can
      // only be set now that the wallet exists.
      account.ownerId = wallet.id
      await account.useTransaction(trx).save()

      business.walletId = wallet.id
      await business.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'business.created',
        resourceType: 'business',
        resourceId: business.id,
        before: undefined,
        after: { code: business.code, status: business.status },
        correlationId: request.correlationId,
        trx,
      })

      return { business, generatedPassword }
    })
  }

  /**
   * Create an additional wallet for an existing, already-onboarded business in a new currency —
   * self-service, beyond the single USD wallet allocated at signup. Idempotent: returns the
   * existing wallet unchanged if one already exists for that currency, same as
   * UserOnboardingService.createDefaultWallet.
   */
  static async createWallet(
    businessId: number,
    currencyCode: string,
    correlationId: string
  ): Promise<{ wallet: Wallet; created: boolean }> {
    return db.transaction(async (trx) => {
      const business = await Business.findOrFail(businessId, { client: trx })

      const existingWallet = await Wallet.query({ client: trx })
        .where('business_id', businessId)
        .where('currency_code', currencyCode)
        .first()

      if (existingWallet) {
        return { wallet: existingWallet, created: false }
      }

      const account = new LedgerAccount()
      account.code = `BUSINESS_WALLET.${business.code}.${currencyCode}`
      account.name = `${currencyCode} wallet for business ${business.name}`
      account.accountType = 'asset'
      account.ownerType = 'business_wallet'
      account.currencyCode = currencyCode
      account.status = 'active'

      await account.useTransaction(trx).save()

      const wallet = new Wallet()
      wallet.businessId = businessId
      wallet.ledgerAccountId = account.id
      wallet.currencyCode = currencyCode
      wallet.balanceCache = 0n
      wallet.status = 'active'

      await wallet.useTransaction(trx).save()

      // owner_id must reference the wallet's own id (see user_onboarding_service.ts /
      // create() above) — it can only be set now that the wallet exists.
      account.ownerId = wallet.id
      await account.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: businessId,
        action: 'business.wallet_created',
        resourceType: 'wallet',
        resourceId: wallet.id,
        before: undefined,
        after: { currency_code: currencyCode },
        correlationId,
        trx,
      })

      return { wallet, created: true }
    })
  }
}
