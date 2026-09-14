import { test } from '@japa/runner'
import env from '#start/env'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'
import { PlanService } from '#services/business/plan_service'

/** Unique per run — these tests write real rows and must not collide with a previous run's. */
const runId = Date.now().toString(36)

async function onboard(label: string) {
  const { business } = await BusinessOnboardingService.create({
    code: `sbx-${runId}-${label}`,
    name: `Sandbox Test Biz ${label}`,
    email: `sbx-${runId}-${label}@biz.test`,
    phone: '260763456789',
    correlationId: 'debug',
  })
  return business
}

test.group('Sandbox mode (APP_MODE)', (group) => {
  const originalMode = env.get('APP_MODE')
  group.each.teardown(() => env.set('APP_MODE', originalMode ?? 'production'))

  test('sandbox signup is active immediately, with no approving admin', async ({ assert }) => {
    env.set('APP_MODE', 'sandbox')
    const business = await onboard('auto')

    assert.equal(business.status, 'active')
    assert.exists(business.approvedAt)
    assert.notExists(business.approvedBy)
  })

  test('production signup still waits for admin approval', async ({ assert }) => {
    env.set('APP_MODE', 'production')
    const business = await onboard('pending')

    assert.equal(business.status, 'pending_approval')
    assert.notExists(business.approvedAt)
  })

  test('sandbox lifts plan gating that the default plan applies in production', async ({
    assert,
  }) => {
    env.set('APP_MODE', 'production')
    const business = await onboard('plan')
    await business.load('plan')

    assert.isFalse(PlanService.hasFeature(business, 'cards.issuing'))

    env.set('APP_MODE', 'sandbox')
    assert.isTrue(PlanService.hasFeature(business, 'cards.issuing'))
  })

  test('issued key prefix follows APP_MODE', async ({ assert }) => {
    env.set('APP_MODE', 'sandbox')
    const business = await onboard('prefix')
    const { apiKey: sandboxKey } = await BusinessApiKeyService.generate(business.id, 1, 'debug')

    env.set('APP_MODE', 'production')
    const { apiKey: liveKey } = await BusinessApiKeyService.generate(business.id, 1, 'debug')

    assert.isTrue(sandboxKey.startsWith('ts_sandbox_'))
    assert.isTrue(liveKey.startsWith('ts_live_'))
  })

  test('a sandbox key sent to production gets an explicit wrong-environment error', async ({
    client,
    assert,
  }) => {
    env.set('APP_MODE', 'production')
    const response = await client
      .get('/api/v1/business/wallet')
      .header('Authorization', 'Bearer ts_sandbox_0123456789abcdef0123456789abcdef')

    assert.equal(response.status(), 401)
    assert.include(response.text(), 'sandbox API key')
  })

  test('a live key sent to the sandbox gets an explicit wrong-environment error', async ({
    client,
    assert,
  }) => {
    env.set('APP_MODE', 'sandbox')
    const response = await client
      .get('/api/v1/business/wallet')
      .header('Authorization', 'Bearer biz_live_0123456789abcdef0123456789abcdef')

    assert.equal(response.status(), 401)
    assert.include(response.text(), 'live API key')
  })

  test('a key that verifies is never rejected for its prefix', async ({ client, assert }) => {
    // e.g. a key issued before APP_MODE existed, when the prefix followed PAWAPAY_ENV instead
    env.set('APP_MODE', 'sandbox')
    const business = await onboard('legacy')
    const { apiKey } = await BusinessApiKeyService.generate(business.id, 1, 'debug')

    env.set('APP_MODE', 'production')
    const response = await client
      .get('/api/v1/business/wallet')
      .header('Authorization', `Bearer ${apiKey}`)

    assert.equal(response.status(), 200)
  })
})
