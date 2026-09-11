import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLifecycleService } from '#services/business/business_lifecycle_service'
import { BusinessApiKeyService } from '#services/business/business_api_key_service'
import KycVerification from '#models/kyc_verification'

/** BusinessLifecycleService.approve() now requires an approved KYC (KYB) on file first. */
async function approveKycFor(businessId: number) {
  const kyc = new KycVerification()
  kyc.subjectType = 'business'
  kyc.subjectId = businessId
  kyc.verificationType = 'document'
  kyc.status = 'approved'
  kyc.submittedAt = DateTime.now()
  kyc.decidedAt = DateTime.now()
  kyc.reviewedBy = 1
  await kyc.save()
}

async function createActiveBusinessWithKey(email: string) {
  const { business } = await BusinessOnboardingService.create({
    code: `http-biz-${email}`,
    name: `HTTP Test Biz ${email}`,
    email,
    phone: '260763456789',
    correlationId: 'debug',
  })
  await approveKycFor(business.id)
  await BusinessLifecycleService.approve(business.id, 1, 'debug')
  const { apiKey } = await BusinessApiKeyService.generate(business.id, 1, 'debug')
  return { business, apiKey }
}

test.group('Business API key middleware', () => {
  test('rejects requests with no Authorization header', async ({ client, assert }) => {
    const response = await client.get('/api/v1/business/wallet')
    assert.equal(response.status(), 401)
  })

  test('rejects an invalid API key', async ({ client, assert }) => {
    const response = await client.get('/api/v1/business/wallet').header('Authorization', 'Bearer biz_sandbox_bogus')
    assert.equal(response.status(), 401)
  })

  test('accepts a valid API key and scopes the wallet to that business only', async ({ client, assert }) => {
    const { apiKey } = await createActiveBusinessWithKey('http-a@biz.test')
    const { apiKey: otherKey } = await createActiveBusinessWithKey('http-b@biz.test')

    const response = await client.get('/api/v1/business/wallet').header('Authorization', `Bearer ${apiKey}`)
    assert.equal(response.status(), 200)
    assert.equal(response.body().data.length, 1)

    const otherResponse = await client.get('/api/v1/business/wallet').header('Authorization', `Bearer ${otherKey}`)
    assert.equal(otherResponse.status(), 200)
    // Different business must see a DIFFERENT wallet id — isolation, not just "some wallet"
    assert.notEqual(response.body().data[0].id, otherResponse.body().data[0].id)
  })

  test('a revoked key is rejected immediately', async ({ client, assert }) => {
    const { business } = await BusinessOnboardingService.create({
      code: 'revoke-http-biz',
      name: 'Revoke HTTP Biz',
      email: 'revoke-http@biz.test',
      phone: '260763456789',
      correlationId: 'debug',
    })
    await approveKycFor(business.id)
    await BusinessLifecycleService.approve(business.id, 1, 'debug')
    const { apiKey, keyId } = await BusinessApiKeyService.generate(business.id, 1, 'debug')

    const before = await client.get('/api/v1/business/wallet').header('Authorization', `Bearer ${apiKey}`)
    assert.equal(before.status(), 200)

    await BusinessApiKeyService.revoke(keyId, 1, 'debug')

    const after = await client.get('/api/v1/business/wallet').header('Authorization', `Bearer ${apiKey}`)
    assert.equal(after.status(), 401)
  })
})
