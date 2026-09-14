import { test } from '@japa/runner'
import Plan from '#models/plan'

/** Unique per run — these tests write real rows and must not collide with a previous run's. */
const runId = Date.now().toString(36)

test.group('Public pricing (GET /api/v1/pricing)', () => {
  test('lists active plans without authentication, archived ones excluded', async ({
    client,
    assert,
  }) => {
    const active = await Plan.create({
      code: `pricing-active-${runId}`,
      name: 'Pricing test active',
      description: 'Visible on the pricing page',
      features: { 'mobile_money.deposits': { countries: ['COD'] }, 'webhooks': true },
      status: 'active',
      price: 5000n,
      maintenancePrice: 100n,
      currencyCode: 'USD',
    })
    const archived = await Plan.create({
      code: `pricing-archived-${runId}`,
      name: 'Pricing test archived',
      description: null,
      features: {},
      status: 'archived',
      price: 1000n,
      maintenancePrice: 0n,
      currencyCode: 'USD',
    })

    const response = await client.get('/api/v1/pricing')

    assert.equal(response.status(), 200)
    const plans = JSON.parse(response.text()).data as Array<Record<string, unknown>>
    const listed = plans.find((p) => p.code === active.code)
    assert.exists(listed)
    assert.deepInclude(listed, {
      name: 'Pricing test active',
      price: '5000',
      maintenance_price: '100',
      currency_code: 'USD',
    })
    assert.deepEqual(listed!.features, active.features)
    assert.notExists(plans.find((p) => p.code === archived.code))
  })
})
