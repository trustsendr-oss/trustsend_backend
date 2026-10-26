import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import { createUserWithWallet } from '#tests/helpers/user_helper'

/**
 * GET /directory/agents/nearby — the agent map. Fixtures sit around a random point in the
 * open ocean so other suites' agents never fall inside the radius, and assertions are on ids
 * rather than counts. The agents created here are removed at the end.
 */
test.group('Directory nearby agents', (group) => {
  const createdIds: number[] = []

  group.teardown(async () => {
    if (createdIds.length) await db.from('agents').whereIn('id', createdIds).delete()
  })

  const suffixOf = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8)

  async function agentAt(
    latitude: number | null,
    longitude: number | null,
    overrides: Partial<Pick<Agent, 'status' | 'businessId' | 'businessName'>> = {}
  ) {
    const suffix = suffixOf()
    const agent = await Agent.create({
      code: `7${suffix}`,
      fullName: `Nearby Agent ${suffix}`,
      email: `nearby${suffix}@example.test`,
      phone: '+25779000000',
      tier: 'master',
      status: 'active',
      commissionRate: 1,
      address: `Avenue ${suffix}`,
      city: 'Testville',
      latitude,
      longitude,
      ...overrides,
    })
    createdIds.push(agent.id)
    return agent
  }

  // A point in the South Pacific, offset per run.
  const origin = () => ({ lat: -48 + Math.random(), lng: -130 + Math.random() })

  test('lists active network agents within the radius, nearest first', async ({
    client,
    assert,
  }) => {
    const { lat, lng } = origin()
    // ~1.1 km and ~3.3 km north of the origin.
    const near = await agentAt(lat + 0.01, lng, { businessName: 'Boutique Proche' })
    const farther = await agentAt(lat + 0.03, lng)
    // ~22 km away: outside the default 10 km radius.
    const outside = await agentAt(lat + 0.2, lng)
    const suspended = await agentAt(lat + 0.005, lng, { status: 'suspended' })
    const noLocation = await agentAt(null, null)

    const { user } = await createUserWithWallet({ email: `nearby${suffixOf()}@test.com` })
    const response = await client
      .get('/api/v1/directory/agents/nearby')
      .qs({ lat, lng })
      .loginAs(user)

    response.assertStatus(200)
    const data = response.body().data as Array<Record<string, unknown>>
    const ids = data.map((row) => row.id)

    assert.include(ids, near.id)
    assert.include(ids, farther.id)
    assert.notInclude(ids, outside.id)
    assert.notInclude(ids, suspended.id)
    assert.notInclude(ids, noLocation.id)
    assert.isBelow(ids.indexOf(near.id), ids.indexOf(farther.id))

    const row = data.find((r) => r.id === near.id)!
    assert.equal(row.name, 'Boutique Proche')
    assert.equal(row.code, near.code)
    assert.closeTo(row.distance_km as number, 1.11, 0.05)
    assert.closeTo(row.latitude as number, lat + 0.01, 1e-6)
    // Only what is on the shopfront.
    assert.notProperty(row, 'phone')
    assert.notProperty(row, 'email')
  })

  test('honours a wider radius up to the cap', async ({ client, assert }) => {
    const { lat, lng } = origin()
    const twentyKm = await agentAt(lat + 0.18, lng)

    const { user } = await createUserWithWallet({ email: `nearby${suffixOf()}@test.com` })
    const wide = await client
      .get('/api/v1/directory/agents/nearby')
      .qs({ lat, lng, radius_km: 25 })
      .loginAs(user)
    wide.assertStatus(200)
    assert.include(
      (wide.body().data as Array<{ id: number }>).map((r) => r.id),
      twentyKm.id
    )

    const tooWide = await client
      .get('/api/v1/directory/agents/nearby')
      .qs({ lat, lng, radius_km: 500 })
      .loginAs(user)
    tooWide.assertStatus(422)
  })

  test('leaves out institution counters', async ({ client, assert }) => {
    const { lat, lng } = origin()
    const business = await db.from('businesses').select('id').first()
    if (!business) return
    const counter = await agentAt(lat + 0.01, lng, { businessId: business.id })

    const { user } = await createUserWithWallet({ email: `nearby${suffixOf()}@test.com` })
    const response = await client
      .get('/api/v1/directory/agents/nearby')
      .qs({ lat, lng })
      .loginAs(user)
    response.assertStatus(200)
    assert.notInclude(
      (response.body().data as Array<{ id: number }>).map((r) => r.id),
      counter.id
    )
  })

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/api/v1/directory/agents/nearby').qs({ lat: 0, lng: 0 })
    response.assertStatus(401)
  })
})
