import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { BusinessOnboardingService } from '#services/business/business_onboarding_service'
import { BusinessLogoService, InvalidLogoException } from '#services/business/business_logo_service'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

/**
 * Institution logos: stored from the bytes' real type, served publicly with a versioned URL, and
 * replaced or removed without leaving the old file behind.
 */
test.group('Business logos', () => {
  test('upload, public read, replacement and removal', async ({ client, assert }) => {
    const suffix = randomUUID().slice(0, 6).toUpperCase()
    const { business } = await BusinessOnboardingService.create({
      code: `LOGO${suffix}`,
      name: `Institution ${suffix}`,
      email: `logo-${suffix}@example.test`,
      phone: '+243900000000',
      correlationId: 'logo-test',
      kind: 'imf',
    })
    const actor = { type: 'internal_user' as const, id: 1 }

    await assert.rejects(
      () => BusinessLogoService.set(business, Buffer.from('not an image'), actor, 'logo-test'),
      InvalidLogoException
    )
    assert.isNull(BusinessLogoService.urlOf(business))

    await BusinessLogoService.set(business, PNG, actor, 'logo-test')
    const url = BusinessLogoService.urlOf(business)!
    assert.match(url, new RegExp(`/finance/institutions/${business.id}/logo\\?v=`))

    const served = await client.get(url.split('?')[0])
    assert.equal(served.status(), 200)
    assert.equal(served.header('content-type'), 'image/png')

    const firstRef = business.logoRef
    await BusinessLogoService.set(business, PNG, actor, 'logo-test')
    assert.notEqual(business.logoRef, firstRef, 'a new upload gets a new file and a new URL')

    await BusinessLogoService.remove(business, actor, 'logo-test')
    const gone = await client.get(url.split('?')[0])
    assert.equal(gone.status(), 404)
  })
})
