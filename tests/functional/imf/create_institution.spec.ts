import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import BusinessStaff from '#models/business_staff'
import KycVerification from '#models/kyc_verification'
import { DateTime } from 'luxon'
import InternalUser from '#models/internal_user'
import Plan from '#models/plan'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLifecycleService } from '#services/business/business_lifecycle_service'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { PlanService } from '#services/business/plan_service'
import { FinancialProductService } from '#services/lending/financial_product_service'

/**
 * The whole path from nothing to an institution that can sell something, exercised end to end.
 *
 * It exists because the steps are ordered in ways that are not obvious and that the individual
 * unit tests each miss: an institution cannot be approved before its KYB is, a counter cannot be
 * created before the head office that sponsors it, and a head office must be active before it can
 * sponsor anything. Each of those is a separate service, and only running them in sequence proves
 * the sequence is actually walkable.
 */
test.group('Creating an institution end to end', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  const userIds: number[] = []
  let staffId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `imf-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    staffId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', staffId).delete()
  })

  /**
   * agent_status_history is append-only by design — it shares the ledger's immutability trigger,
   * which is also why deleting from it reports "Ledger entries are immutable". An agent that was
   * ever approved therefore cannot be removed, and neither can the institution owning it, so
   * those rows are left behind deliberately, exactly as audit rows are.
   */
  group.each.teardown(async () => {
    await db.from('business_staff').whereIn('business_id', businessIds).delete()
    await db.from('financial_products').whereIn('provider_id', businessIds).delete()

    const agents = await db.from('agents').whereIn('business_id', businessIds).select('id')
    const agentIds = agents.map((a) => a.id)
    const withHistory = await db
      .from('agent_status_history')
      .whereIn('agent_id', agentIds)
      .distinct('agent_id')
    const frozen = new Set(withHistory.map((h) => h.agent_id))
    const removable = agentIds.filter((id) => !frozen.has(id))

    await db.from('wallets').whereIn('agent_id', removable).delete()
    await db.from('agents').whereIn('id', removable).delete()

    const stillOwned = await db
      .from('agents')
      .whereIn('business_id', businessIds)
      .select('business_id')
    const kept = new Set(stillOwned.map((a) => a.business_id))
    const deletable = businessIds.filter((id) => !kept.has(id))

    for (const id of deletable) {
      await db.from('wallets').where('business_id', id).delete()
      await db
        .from('kyc_verifications')
        .where('subject_type', 'business')
        .where('subject_id', id)
        .delete()
    }
    for (const [index, code] of businessCodes.entries()) {
      if (deletable.includes(businessIds[index])) {
        await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
      }
    }
    await db.from('businesses').whereIn('id', deletable).delete()

    const stillLinked = await db.from('agents').whereIn('user_id', userIds).select('user_id')
    const keptUsers = new Set(stillLinked.map((a) => a.user_id))
    await db
      .from('users')
      .whereIn(
        'id',
        userIds.filter((id) => !keptUsers.has(id))
      )
      .delete()

    businessIds.length = 0
    businessCodes.length = 0
    userIds.length = 0
  })

  /** Both business and agent approval refuse to run until an approved verification is on file. */
  async function approveKycFor(subjectType: 'business' | 'agent', subjectId: number) {
    const kyc = new KycVerification()
    kyc.subjectType = subjectType
    kyc.subjectId = subjectId
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    kyc.reviewedBy = staffId
    await kyc.save()
  }

  test('an institution goes from creation to a published product', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const code = `IMFE2E${suffix}`

    // 1. The institution is created, already labelled as one.
    const { business, generatedPassword } = await BusinessOnboardingService.create({
      code,
      name: `IMF Kivu ${suffix}`,
      email: `kivu${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `e2e-${suffix}`,
      kind: 'imf',
    })
    businessIds.push(business.id)
    businessCodes.push(code)

    assert.equal(business.kind, 'imf')
    assert.isNotNull(business.walletId, 'it gets a wallet at creation')
    assert.isString(generatedPassword, 'and a dashboard password handed over once')

    // 2. Its KYB must be approved before it can be — a hard gate, not a convention.
    if (business.status === 'pending_approval') {
      await assert.rejects(
        () => BusinessLifecycleService.approve(business.id, staffId, `e2e-${suffix}`),
        'Business KYC must be approved before the business itself can be approved'
      )

      await approveKycFor('business', business.id)
      await BusinessLifecycleService.approve(business.id, staffId, `e2e-${suffix}`)
      await business.refresh()
    }
    assert.equal(business.status, 'active')

    // 3. The plan is what actually grants it the right to sell credit.
    const imfPlan = await Plan.query().where('code', 'imf_standard').firstOrFail()
    await PlanService.assignToBusiness(business.id, imfPlan.id, staffId, `e2e-${suffix}`)
    await business.refresh()
    await business.load('plan')
    assert.isTrue(business.plan.hasFeature('lending.credit'))

    // 4. A head office. `tier_parent_hierarchy` only lets a master or distributor sit at the root
    //    of a network, so the head office takes the distributor tier.
    const headUser = await User.create({
      fullName: `Head Office ${suffix}`,
      email: `head${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(headUser.id)

    const head = await AgentOnboardingService.create({
      userId: headUser.id,
      businessId: business.id,
      code: `6${suffix}`,
      fullName: `Siege ${suffix}`,
      email: `siege${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `e2e-${suffix}`,
    })
    assert.equal(head.businessId, business.id)

    // 5. A counter cannot be sponsored by an inactive head office.
    const tellerUser = await User.create({
      fullName: `Teller ${suffix}`,
      email: `teller${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(tellerUser.id)

    await assert.rejects(
      () =>
        AgentOnboardingService.create({
          userId: tellerUser.id,
          businessId: business.id,
          code: `5${suffix}`,
          fullName: `Guichet Goma ${suffix}`,
          email: `goma${suffix}@example.test`,
          phone: '+243900000002',
          tier: 'agent',
          parentAgentId: head.id,
          correlationId: `e2e-${suffix}`,
        }),
      'Parent agent must be active'
    )

    await approveKycFor('agent', head.id)
    await AgentLifecycleService.approve(head.id, staffId, `e2e-${suffix}`)
    await head.refresh()
    assert.equal(head.status, 'active')

    const counter = await AgentOnboardingService.create({
      userId: tellerUser.id,
      businessId: business.id,
      code: `5${suffix}`,
      fullName: `Guichet Goma ${suffix}`,
      email: `goma${suffix}@example.test`,
      phone: '+243900000002',
      tier: 'agent',
      parentAgentId: head.id,
      correlationId: `e2e-${suffix}`,
    })
    assert.equal(counter.businessId, business.id)
    assert.equal(counter.parentAgentId, head.id)

    // 6. Someone to stand at it.
    const staff = await BusinessStaff.create({
      businessId: business.id,
      userId: tellerUser.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })
    assert.equal(staff.businessId, business.id)

    // 7. Something to sell, once TumaPlus has read it.
    const product = await FinancialProductService.create(
      business.id,
      {
        code: `CRED${suffix}`,
        name: 'Credit commercant',
        kind: 'loan',
        currencyCode: 'USD',
        minAmount: 50_00n,
        maxAmount: 2_000_00n,
        interestRateBps: 500,
        interestPeriod: 'month',
        interestMethod: 'flat',
        termMonthsMin: 3,
        termMonthsMax: 12,
      },
      `e2e-${suffix}`
    )
    await FinancialProductService.submit(product, `e2e-${suffix}`)
    await FinancialProductService.approve(product, staffId, `e2e-${suffix}`)

    const published = await FinancialProductService.listPublished({ kind: 'loan' })
    assert.include(
      published.map((p) => p.id),
      product.id
    )
  })

  test('a counter cannot hang off another institution head office', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)

    const make = async (label: string) => {
      const code = `IMFX${label}${suffix}`
      const { business } = await BusinessOnboardingService.create({
        code,
        name: `IMF ${label} ${suffix}`,
        email: `x${label}${suffix}@example.test`,
        phone: '+243900000000',
        correlationId: `e2e-${suffix}`,
        kind: 'imf',
      })
      businessIds.push(business.id)
      businessCodes.push(code)
      business.status = 'active'
      await business.save()
      return business
    }

    const first = await make('A')
    const second = await make('B')

    const headUser = await User.create({
      fullName: `Head ${suffix}`,
      email: `headx${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(headUser.id)
    const head = await AgentOnboardingService.create({
      userId: headUser.id,
      businessId: first.id,
      code: `4${suffix}`,
      fullName: `Siege A ${suffix}`,
      email: `siegex${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'distributor',
      correlationId: `e2e-${suffix}`,
    })
    await approveKycFor('agent', head.id)
    await AgentLifecycleService.approve(head.id, staffId, `e2e-${suffix}`)

    const otherUser = await User.create({
      fullName: `Other ${suffix}`,
      email: `otherx${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(otherUser.id)

    await assert.rejects(
      () =>
        AgentOnboardingService.create({
          userId: otherUser.id,
          businessId: second.id,
          code: `3${suffix}`,
          fullName: `Guichet B ${suffix}`,
          email: `guichetx${suffix}@example.test`,
          phone: '+243900000002',
          tier: 'agent',
          parentAgentId: head.id,
          correlationId: `e2e-${suffix}`,
        }),
      'A parent agent must belong to the same institution as its child'
    )
  })
})
