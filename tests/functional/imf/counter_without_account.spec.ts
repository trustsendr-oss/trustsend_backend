import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import BusinessStaff from '#models/business_staff'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import {
  BusinessStaffIdentityService,
  CounterNotActiveException,
  StaffNotPostedException,
} from '#services/business/business_staff_identity_service'

/**
 * A counter is a place; a teller is a person. Only the second has an account.
 *
 * TumaPlus's own agents are the opposite case and must stay that way: an agent there IS a person,
 * and every flow that lets one act — confirming a cash-in, pushing float — resolves the agent from
 * the signed-in user. Creating one with no account would produce an agent nobody can operate, so
 * that is still refused. An institution's counter has no account at all, and the posting in
 * business_staff is what says who may stand at it.
 */
test.group('Counters have no account of their own', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  const userIds: number[] = []
  let staffId = 0

  group.setup(async () => {
    const admin = await InternalUser.create({
      email: `counter-admin-${Date.now()}@example.test`,
      fullName: 'Platform Admin',
      password: 'a-real-password',
      status: 'active',
    })
    staffId = admin.id
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', staffId).delete()
  })

  /** Agents that were ever approved cannot be removed: agent_status_history is append-only. */
  group.each.teardown(async () => {
    await db.from('business_staff').whereIn('business_id', businessIds).delete()
    const agents = await db.from('agents').whereIn('business_id', businessIds).select('id')
    const agentIds = agents.map((a) => a.id)
    const history = await db
      .from('agent_status_history')
      .whereIn('agent_id', agentIds)
      .distinct('agent_id')
    const frozen = new Set(history.map((h) => h.agent_id))
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
    for (const [i, code] of businessCodes.entries()) {
      if (deletable.includes(businessIds[i])) {
        await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
      }
    }
    await db.from('businesses').whereIn('id', deletable).delete()

    const linked = await db.from('agents').whereIn('user_id', userIds).select('user_id')
    const keptUsers = new Set(linked.map((a) => a.user_id))
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

  async function makeInstitution(suffix: string) {
    const code = `TESTCNT${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `cnt${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `cnt-${suffix}`,
      kind: 'imf',
    })
    businessIds.push(business.id)
    businessCodes.push(code)
    business.status = 'active'
    await business.save()
    return business
  }

  function openCounter(
    businessId: number,
    suffix: string,
    tier: 'distributor' | 'agent' = 'distributor',
    parentAgentId?: number
  ) {
    return AgentOnboardingService.create({
      businessId,
      code: `2${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `counter${suffix}@example.test`,
      phone: '+243900000001',
      tier,
      parentAgentId,
      correlationId: `cnt-${suffix}`,
    })
  }

  test('an institution counter is created with no account at all', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)

    const counter = await openCounter(imf.id, suffix)

    assert.isNull(counter.userId)
    assert.equal(counter.businessId, imf.id)
    assert.isNotNull(counter.walletId, 'it still gets a float wallet')

    // And it is unreachable through the personal-login path, by construction.
    const byUser = await AgentIdentityService.findActiveAgentForUser(staffId)
    assert.isNull(byUser)
  })

  test('a TumaPlus network agent still requires one', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)

    await assert.rejects(
      () =>
        AgentOnboardingService.create({
          code: `1${suffix}`,
          fullName: `Orphan ${suffix}`,
          email: `orphan${suffix}@example.test`,
          phone: '+243900000002',
          tier: 'distributor',
          correlationId: `cnt-${suffix}`,
        }),
      'A TumaPlus network agent must be linked to a user account'
    )
  })

  test('a posted teller resolves to their counter', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const counter = await openCounter(imf.id, suffix)
    await approveKycFor('agent', counter.id)
    await AgentLifecycleService.approve(counter.id, staffId, `cnt-${suffix}`)

    const teller = await User.create({
      fullName: `Teller ${suffix}`,
      email: `t${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(teller.id)
    const staff = await BusinessStaff.create({
      businessId: imf.id,
      userId: teller.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })

    const resolved = await BusinessStaffIdentityService.requireCounterForStaff(staff)
    assert.equal(resolved.id, counter.id)
    assert.isNull(resolved.userId, 'resolved through the posting, not through an account')
  })

  test('a staff member with no posting reaches no counter', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)

    const manager = await User.create({
      fullName: `Manager ${suffix}`,
      email: `m${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(manager.id)
    const staff = await BusinessStaff.create({
      businessId: imf.id,
      userId: manager.id,
      agentId: null,
      role: 'branch_manager',
      status: 'active',
    })

    await assert.rejects(
      () => BusinessStaffIdentityService.requireCounterForStaff(staff),
      StaffNotPostedException.prototype.message
    )
  })

  test('a counter that is not active cannot be worked', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const counter = await openCounter(imf.id, suffix)

    const teller = await User.create({
      fullName: `Teller ${suffix}`,
      email: `ti${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(teller.id)
    const staff = await BusinessStaff.create({
      businessId: imf.id,
      userId: teller.id,
      agentId: counter.id,
      role: 'teller',
      status: 'active',
    })

    // Never approved, so still pending_approval.
    assert.equal(counter.status, 'pending_approval')
    await assert.rejects(() => BusinessStaffIdentityService.requireCounterForStaff(staff))

    try {
      await BusinessStaffIdentityService.requireCounterForStaff(staff)
    } catch (error) {
      assert.instanceOf(error, CounterNotActiveException)
    }
  })
})
