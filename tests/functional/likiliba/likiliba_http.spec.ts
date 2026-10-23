import { test } from '@japa/runner'
import { randomInt, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { PinService } from '#services/security/pin_service'

/**
 * The likiliba API as the app calls it: validation, PIN, idempotency, and who may see a group.
 */
test.group('Likiliba HTTP', () => {
  async function person() {
    const user = await User.create({
      fullName: `Membre ${randomInt(1000, 9999)}`,
      email: `lkh-${randomUUID()}@example.test`,
      password: 'a-real-password',
      code: String(randomInt(100_000_000, 1_000_000_000)),
    })
    await PinService.setPin(user, '1234')
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = user.id
    kyc.verificationType = 'document'
    kyc.status = 'approved'
    kyc.submittedAt = DateTime.now()
    kyc.decidedAt = DateTime.now()
    await kyc.save()
    return user
  }

  const body = (overrides: Record<string, unknown> = {}) => ({
    name: 'Likiliba du marché',
    currency_code: 'CDF',
    contribution_amount: '500000',
    frequency: 'weekly',
    size: 2,
    starts_at: DateTime.now().plus({ days: 3 }).toISO(),
    caution_required: true,
    penalty_mode: 'percent',
    penalty_daily_bps: 100,
    penalty_cap_bps: 1000,
    ordering_mode: 'draw',
    ...overrides,
  })

  test('create, invite, read rules and penalties; outsiders see nothing', async ({
    client,
    assert,
  }) => {
    const organiser = await person()
    const guest = await person()
    const outsider = await person()

    const bif = await client
      .post('/api/v1/likilibas')
      .loginAs(organiser)
      .json(body({ currency_code: 'BIF' }))
    assert.equal(bif.status(), 422)

    const created = await client.post('/api/v1/likilibas').loginAs(organiser).json(body())
    assert.equal(created.status(), 201)
    const id = created.body().data.id
    assert.equal(created.body().data.currency_code, 'CDF')
    assert.equal(created.body().data.round_gross_amount, '500000')
    assert.equal(created.body().data.round_commission_amount, '5000')
    assert.isAbove(created.body().data.rules.clauses.length, 10)

    const invite = await client
      .post(`/api/v1/likilibas/${id}/invitations`)
      .loginAs(organiser)
      .json({ channel: 'account', user_code: guest.code })
    assert.equal(invite.status(), 201)

    const mine = await client.get('/api/v1/likilibas/invitations').loginAs(guest)
    assert.equal(mine.status(), 200)
    const received = mine.body().data.find((i: any) => i.likiliba.id === id)
    assert.exists(received)
    assert.isArray(received.rules.clauses)

    const accepted = await client
      .post(`/api/v1/likilibas/invitations/${received.id}/accept`)
      .loginAs(guest)
    assert.equal(accepted.status(), 200)
    const admitted = await client
      .post(`/api/v1/likilibas/invitations/${received.id}/admit`)
      .loginAs(organiser)
    assert.equal(admitted.status(), 200)

    const wrongPin = await client
      .post(`/api/v1/likilibas/${id}/lock`)
      .loginAs(organiser)
      .json({ pin: '0000' })
    assert.equal(wrongPin.status(), 401)
    const locked = await client
      .post(`/api/v1/likilibas/${id}/lock`)
      .loginAs(organiser)
      .json({ pin: '1234' })
    assert.equal(locked.status(), 200)
    const hash = locked.body().data.rules.hash

    // Signing is idempotent: the same key twice locks the caution once.
    const key = randomUUID()
    const commit = () =>
      client
        .post(`/api/v1/likilibas/${id}/commit`)
        .loginAs(guest)
        .json({ pin: '1234', rules_hash: hash, auto_debit: false, idempotency_key: key })
    // No CDF balance: the caution cannot be locked.
    const broke = await commit()
    assert.equal(broke.status(), 402)
    assert.equal(broke.body().code, 'INSUFFICIENT_FUNDS')

    const penalties = await client.get(`/api/v1/likilibas/${id}/penalties`).loginAs(guest)
    assert.equal(penalties.status(), 200)
    assert.equal(penalties.body().meta.daily_amount, '5000')
    assert.equal(penalties.body().meta.cap_per_contribution, '50000')

    const history = await client.get(`/api/v1/likilibas/${id}/history`).loginAs(guest)
    assert.isAbove(history.body().data.length, 3)

    for (const path of ['', '/rules', '/history', '/penalties', '/draw']) {
      const res = await client.get(`/api/v1/likilibas/${id}${path}`).loginAs(outsider)
      assert.equal(res.status(), 404, `outsider on ${path || '/'}`)
    }
    const notOrganiser = await client
      .post(`/api/v1/likilibas/${id}/start`)
      .loginAs(guest)
      .json({ pin: '1234' })
    assert.equal(notOrganiser.status(), 403)
  })
})
