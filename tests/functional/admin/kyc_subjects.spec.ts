import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import InternalUser from '#models/internal_user'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'

/**
 * The KYC review queue names who each file is about and can be searched by that person's name,
 * e-mail or code — reviewers used to see only "user #103".
 */
test.group('Admin KYC subjects', (group) => {
  let admin: InternalUser

  group.setup(async () => {
    admin = await InternalUser.create({
      email: `kyc-subjects-admin-${Date.now()}@example.test`,
      fullName: 'Reviewer',
      password: 'a-real-password',
      status: 'active',
      mustChangePassword: false,
      mfaEnabled: true,
    })
  })

  group.teardown(async () => {
    await db.from('internal_users').where('id', admin.id).delete()
  })

  test('lists subjects by name and finds them by name, e-mail or code', async ({
    client,
    assert,
  }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await User.create({
      fullName: `Mwamini Zawadi ${suffix}`,
      code: `5${suffix}`,
      email: `mwamini${suffix}@example.test`,
      password: 'a-real-password',
    })
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = user.id
    kyc.verificationType = 'identity'
    kyc.status = 'pending'
    kyc.submittedAt = DateTime.now()
    await kyc.save()

    const as = (req: any) => req.withGuard('internal').loginAs(admin)

    for (const term of [`Zawadi ${suffix}`, `mwamini${suffix}@`, `5${suffix}`]) {
      const response = await as(client.get('/api/v1/kyc').qs({ q: term }))
      response.assertStatus(200)
      const rows = (response.body() as any).data
      assert.lengthOf(rows, 1, `search "${term}"`)
      assert.equal(rows[0].id, kyc.id)
      assert.equal(rows[0].subject.name, user.fullName)
      assert.equal(rows[0].subject.email, user.email)
    }

    const none = await as(client.get('/api/v1/kyc').qs({ q: `nobody-${suffix}` }))
    assert.lengthOf((none.body() as any).data, 0)

    const show = await as(client.get(`/api/v1/kyc/${kyc.id}`))
    assert.equal((show.body() as any).data.subject.code, user.code)
  })
})
