import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import Business from '#models/business'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'

/**
 * Phase 0 of the IMF work: an institution is a `businesses` row labelled by `kind`, and its
 * counters are `agents` rows carrying that institution's id.
 *
 * What these tests actually protect is the isolation boundary. `agents.business_id` is the column
 * every tenant-scoped query will filter on once counters can move money, so the two failure modes
 * worth catching early are a TumaPlus network agent leaking into an institution's branch list, and
 * a branch pointing at an institution that does not exist. Both are asserted below.
 *
 * Model-level rather than over HTTP: no route reads either column yet, so there is nothing to call.
 */
test.group('IMF institution and branches', (group) => {
  const created: { businessIds: number[]; codes: string[] } = { businessIds: [], codes: [] }

  group.each.teardown(async () => {
    // agents first — agents.business_id is a real FK and restricts on delete, by design.
    // The audit rows these fixtures produce are deliberately left behind: audit_logs is immutable
    // at the database level, and a test is not a reason to make an exception to that.
    for (const id of created.businessIds) {
      await db.from('agents').where('business_id', id).delete()
      await db.from('wallets').where('business_id', id).delete()
    }
    for (const code of created.codes) {
      await db.from('ledger_accounts').where('code', `BUSINESS_WALLET.${code}`).delete()
    }
    await db.from('businesses').whereIn('id', created.businessIds).delete()
    created.businessIds = []
    created.codes = []
  })

  async function makeBusiness(suffix: string, kind?: 'merchant' | 'imf') {
    const code = `TESTIMF${suffix}`
    const { business } = await BusinessOnboardingService.create({
      code,
      name: `Institution ${suffix}`,
      email: `imf${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: `test-imf-${suffix}`,
      kind,
    })
    created.businessIds.push(business.id)
    created.codes.push(code)
    return business
  }

  /**
   * An institution's head office. `tier_parent_hierarchy` only lets a `master` or `distributor`
   * sit at the root of a network, so the head office takes the distributor tier and every counter
   * hangs off it — which is also what lets FloatTransferService push float down from the
   * institution to its counters.
   */
  function makeHeadOffice(businessId: number, suffix: string) {
    return Agent.create({
      code: `8${suffix}`,
      fullName: `Head office ${suffix}`,
      email: `head${suffix}@example.test`,
      phone: '+243900000002',
      tier: 'distributor',
      status: 'pending_approval',
      commissionRate: 2.5,
      businessId,
    })
  }

  function makeBranch(businessId: number | null, parentAgentId: number, suffix: string) {
    return Agent.create({
      code: `9${suffix}`,
      fullName: `Counter ${suffix}`,
      email: `counter${suffix}@example.test`,
      phone: '+243900000001',
      tier: 'agent',
      status: 'pending_approval',
      commissionRate: 2.5,
      parentAgentId,
      businessId,
    })
  }

  test('an onboarded business is a merchant until it is told otherwise', async ({ assert }) => {
    const business = await makeBusiness(`${Date.now()}`.slice(-8))

    assert.equal(business.kind, 'merchant')
  })

  test('a business can be promoted to an IMF', async ({ assert }) => {
    const business = await makeBusiness(`${Date.now()}`.slice(-8))

    business.kind = 'imf'
    await business.save()

    const reloaded = await Business.findOrFail(business.id)
    assert.equal(reloaded.kind, 'imf')
  })

  test('an unknown kind is refused by the check constraint', async ({ assert }) => {
    const business = await makeBusiness(`${Date.now()}`.slice(-8))

    await assert.rejects(() =>
      db.from('businesses').where('id', business.id).update({ kind: 'cooperative' })
    )
  })

  test('an institution is onboarded directly as an IMF', async ({ assert }) => {
    const business = await makeBusiness(`${Date.now()}`.slice(-8), 'imf')

    assert.equal(business.kind, 'imf')
    const reloaded = await Business.findOrFail(business.id)
    assert.equal(reloaded.kind, 'imf')
  })

  test('branches resolve to their own institution only', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeBusiness(suffix, 'imf')
    const other = await makeBusiness(`${Number(suffix) + 1}`.slice(-8), 'imf')

    const head = await makeHeadOffice(imf.id, `${suffix}0`)
    const otherHead = await makeHeadOffice(other.id, `${suffix}9`)
    const branch = await makeBranch(imf.id, head.id, `${suffix}1`)
    await makeBranch(other.id, otherHead.id, `${suffix}2`)
    const networkAgent = await makeBranch(null, head.id, `${suffix}3`)

    assert.equal(branch.businessId, imf.id)
    assert.isNull(networkAgent.businessId)

    await imf.load('branches')
    // `b` is annotated because the project-wide `HasMany` type import is currently broken
    // (see typecheck output), which would otherwise make this parameter implicitly any.
    const tenantIds = imf.branches.map((b: Agent) => b.id).sort()
    assert.deepEqual(tenantIds, [head.id, branch.id].sort())

    // A TumaPlus network agent belongs to no tenant and must never surface inside one, even when
    // it hangs off an institution's head office in the agent hierarchy.
    assert.notInclude(tenantIds, networkAgent.id)

    await db.from('agents').where('id', networkAgent.id).delete()
  })

  test('a branch cannot point at an institution that does not exist', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const imf = await makeBusiness(suffix, 'imf')
    const head = await makeHeadOffice(imf.id, `${suffix}0`)

    await assert.rejects(() => makeBranch(999_999_999, head.id, `${suffix}4`))
  })
})
