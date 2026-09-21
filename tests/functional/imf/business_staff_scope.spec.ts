import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Agent from '#models/agent'
import type Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import BusinessStaffMiddleware from '#middleware/business_staff_middleware'
import { BusinessStaffIdentityService } from '#services/business/business_staff_identity_service'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'

/**
 * The isolation boundary between institutions.
 *
 * A teller acts for exactly one institution, and which one is stated by their membership row —
 * never by anything they send. These tests exist because a teller of one IMF reaching another's
 * customers is a leak between direct competitors, and because nothing else in the codebase would
 * notice if the resolution stopped being tied to the membership.
 *
 * The middleware is exercised against a real HttpContext rather than over HTTP: no route mounts it
 * yet, and what is worth pinning down is the contract it establishes — that it sets the same
 * `ctx.business` as the API-key and dashboard paths, so plan and status gating work unchanged.
 */
test.group('Institution staff scope', (group) => {
  const businessIds: number[] = []
  const businessCodes: string[] = []
  const userIds: number[] = []

  group.each.teardown(async () => {
    await db.from('business_staff').whereIn('business_id', businessIds).delete()
    for (const id of businessIds) {
      await db.from('agents').where('business_id', id).delete()
      await db.from('wallets').where('business_id', id).delete()
    }
    for (const code of businessCodes) {
      await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
    }
    await db.from('businesses').whereIn('id', businessIds).delete()
    await db.from('users').whereIn('id', userIds).delete()
    businessIds.length = 0
    businessCodes.length = 0
    userIds.length = 0
  })

  async function makeInstitution(suffix: string) {
    const code = `TESTSTAFF${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `staff${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `test-staff-${suffix}`,
      kind: 'imf',
    })
    businessIds.push(business.id)
    businessCodes.push(code)
    return business
  }

  async function makeStaff(
    business: Business,
    suffix: string,
    options: {
      role?: 'teller' | 'branch_manager'
      status?: 'active' | 'suspended'
      agentId?: number
    } = {}
  ) {
    const user = await User.create({
      fullName: `Teller ${suffix}`,
      email: `teller${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(user.id)

    const staff = await BusinessStaff.create({
      businessId: business.id,
      userId: user.id,
      agentId: options.agentId ?? null,
      role: options.role ?? 'teller',
      status: options.status ?? 'active',
    })
    return { user, staff }
  }

  async function runMiddleware(user: User) {
    const ctx = await testUtils.createHttpContext()
    ctx.auth = { user } as any

    let reachedRoute = false
    await new BusinessStaffMiddleware().handle(ctx, async () => {
      reachedRoute = true
    })
    return { ctx, reachedRoute }
  }

  test('a teller resolves to the institution that employs them', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const { user } = await makeStaff(imf, suffix)

    const staff = await BusinessStaffIdentityService.requireActiveStaffForUser(user.id)

    assert.equal(staff.businessId, imf.id)
    assert.equal(staff.business.id, imf.id)
    assert.equal(staff.business.kind, 'imf')
  })

  test('the middleware sets the same ctx.business the other access paths set', async ({
    assert,
  }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const { user, staff } = await makeStaff(imf, suffix, { role: 'branch_manager' })

    const { ctx, reachedRoute } = await runMiddleware(user)

    assert.isTrue(reachedRoute)
    assert.equal(ctx.business.id, imf.id)
    assert.equal(ctx.businessStaff.id, staff.id)
    assert.equal(ctx.businessStaff.role, 'branch_manager')
    assert.equal(ctx.businessAuthMethod, 'staff')
  })

  test('a teller posted to a counter carries which counter', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const head = await Agent.create({
      code: `7${suffix}`,
      fullName: `Head office ${suffix}`,
      email: `head${suffix}@example.test`,
      phone: '+243900000003',
      tier: 'distributor',
      status: 'active',
      commissionRate: 2.5,
      businessId: imf.id,
    })
    const { user } = await makeStaff(imf, suffix, { agentId: head.id })

    const { ctx } = await runMiddleware(user)
    assert.equal(ctx.businessStaff.agentId, head.id)
  })

  test('a suspended membership does not resolve', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const { user } = await makeStaff(imf, suffix, { status: 'suspended' })

    const resolved = await BusinessStaffIdentityService.findActiveStaffForUser(user.id)
    assert.isNull(resolved)

    const { reachedRoute } = await runMiddleware(user)
    assert.isFalse(reachedRoute)
  })

  test('an ordinary user reaches no institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await User.create({
      fullName: 'Ordinary Holder',
      email: `outsider${suffix}@example.test`,
      password: 'a-real-password',
    })
    userIds.push(user.id)

    const { reachedRoute } = await runMiddleware(user)
    assert.isFalse(reachedRoute)
  })

  test('staff of one institution never resolve to another', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const first = await makeInstitution(suffix)
    const second = await makeInstitution(`${Number(suffix) + 1}`.slice(-8))

    const { user: firstTeller } = await makeStaff(first, `${suffix}a`)
    const { user: secondTeller } = await makeStaff(second, `${suffix}b`)

    const a = await runMiddleware(firstTeller)
    const b = await runMiddleware(secondTeller)

    assert.equal(a.ctx.business.id, first.id)
    assert.equal(b.ctx.business.id, second.id)
    assert.notEqual(a.ctx.business.id, b.ctx.business.id)
  })

  test('one person holds at most one membership per institution', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeInstitution(suffix)
    const { user } = await makeStaff(imf, suffix)

    await assert.rejects(() =>
      BusinessStaff.create({
        businessId: imf.id,
        userId: user.id,
        agentId: null,
        role: 'credit_officer',
        status: 'active',
      })
    )
  })
})
