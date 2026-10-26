import { test } from '@japa/runner'
import { randomInt, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import KycVerification from '#models/kyc_verification'
import User from '#models/user'
import { PinService } from '#services/security/pin_service'
import InternalUser from '#models/internal_user'
import { LikilibaChatService } from '#services/likiliba/chat_service'
import { AvatarStorageService } from '#services/users/avatar_storage_service'

/**
 * The likiliba API as the app calls it: validation, PIN, idempotency, and who may see a group.
 */
/** Response bodies as plain JSON: the typed route registry narrows them to their happy path. */
const json = (res: { body(): unknown }) => res.body() as any

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
    const id = json(created).data.id
    assert.equal(json(created).data.currency_code, 'CDF')
    assert.equal(json(created).data.round_gross_amount, '500000')
    assert.equal(json(created).data.round_commission_amount, '5000')
    assert.isAbove(json(created).data.rules.clauses.length, 10)

    const invite = await client
      .post(`/api/v1/likilibas/${id}/invitations`)
      .loginAs(organiser)
      .json({ channel: 'account', user_code: guest.code })
    assert.equal(invite.status(), 201)

    const mine = await client.get('/api/v1/likilibas/invitations').loginAs(guest)
    assert.equal(mine.status(), 200)
    const received = json(mine).data.find((i: any) => i.likiliba.id === id)
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
    const hash = json(locked).data.rules.hash

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
    assert.equal(json(broke).code, 'INSUFFICIENT_FUNDS')

    const penalties = await client.get(`/api/v1/likilibas/${id}/penalties`).loginAs(guest)
    assert.equal(penalties.status(), 200)
    assert.equal(json(penalties).meta.daily_amount, '5000')
    assert.equal(json(penalties).meta.cap_per_contribution, '50000')

    const history = await client.get(`/api/v1/likilibas/${id}/history`).loginAs(guest)
    assert.isAbove(json(history).data.length, 3)

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

  test('the group conversation: messages and events in one feed, unread, delete, report, hide', async ({
    client,
    assert,
  }) => {
    const organiser = await person()
    const guest = await person()

    const created = await client
      .post('/api/v1/likilibas')
      .loginAs(organiser)
      .json(body({ size: 3 }))
    const id = json(created).data.id
    const invite = await client
      .post(`/api/v1/likilibas/${id}/invitations`)
      .loginAs(organiser)
      .json({ channel: 'account', user_code: guest.code })
    const invitationId = json(invite).data.id
    await client.post(`/api/v1/likilibas/invitations/${invitationId}/accept`).loginAs(guest)
    await client.post(`/api/v1/likilibas/invitations/${invitationId}/admit`).loginAs(organiser)

    const sent = await client
      .post(`/api/v1/likilibas/${id}/messages`)
      .loginAs(guest)
      .json({ body: '  Bonjour à tous  ' })
    assert.equal(sent.status(), 201)
    assert.equal(json(sent).data.body, 'Bonjour à tous')
    assert.isTrue(json(sent).data.mine)

    const empty = await client
      .post(`/api/v1/likilibas/${id}/messages`)
      .loginAs(guest)
      .json({ body: '   ' })
    assert.equal(empty.status(), 422)

    // The organiser's feed interleaves the message with the group's events.
    const feed = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(organiser)
    assert.equal(feed.status(), 200)
    const items = json(feed).data
    assert.equal(items[0].kind, 'message')
    assert.equal(items[0].body, 'Bonjour à tous')
    assert.isFalse(items[0].mine)
    assert.includeMembers(
      items.filter((i: any) => i.kind === 'event').map((i: any) => i.event_type),
      ['created', 'member_admitted']
    )

    // The list carries the latest activity and what is unread, until the group is read.
    const list = await client.get('/api/v1/likilibas').loginAs(organiser)
    const row = json(list).data.find((g: any) => g.id === id)
    assert.equal(row.last_activity.body, 'Bonjour à tous')
    assert.isAbove(row.unread_count, 0)
    await client.post(`/api/v1/likilibas/${id}/read`).loginAs(organiser)
    const after = await client.get('/api/v1/likilibas').loginAs(organiser)
    assert.equal(json(after).data.find((g: any) => g.id === id).unread_count, 0)

    // Reactions: one per member, a second tap removes it; read receipts once everyone read.
    const reactedId = Number(String(json(sent).data.id).slice(2))
    const like = await client
      .put(`/api/v1/likilibas/${id}/messages/${reactedId}/reaction`)
      .loginAs(organiser)
      .json({ emoji: '👍' })
    assert.deepEqual(json(like).data.reactions, [{ emoji: '👍', count: 1, mine: true }])
    const bad = await client
      .put(`/api/v1/likilibas/${id}/messages/${reactedId}/reaction`)
      .loginAs(organiser)
      .json({ emoji: '💩' })
    assert.equal(bad.status(), 422)
    const guestView = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(guest)
    const own = json(guestView).data.find((i: any) => i.id === `m:${reactedId}`)
    assert.deepEqual(own.reactions, [{ emoji: '👍', count: 1, mine: false }])
    assert.isTrue(own.read_by_all, 'the only other member has read the conversation since')
    const unlike = await client
      .put(`/api/v1/likilibas/${id}/messages/${reactedId}/reaction`)
      .loginAs(organiser)
      .json({ emoji: '👍' })
    assert.deepEqual(json(unlike).data.reactions, [])

    // Only the author deletes; someone else reports; support hides.
    const messageId = Number(String(json(sent).data.id).slice(2))
    const notAuthor = await client
      .delete(`/api/v1/likilibas/${id}/messages/${messageId}`)
      .loginAs(organiser)
    assert.equal(notAuthor.status(), 403)
    const report = await client
      .post(`/api/v1/likilibas/${id}/messages/${messageId}/report`)
      .loginAs(organiser)
      .json({ reason: 'Message déplacé' })
    assert.equal(report.status(), 201)

    const staff = await InternalUser.create({
      email: `lkh-staff-${randomUUID()}@example.test`,
      fullName: 'Support',
      password: 'a-real-password',
      status: 'active',
    })
    await LikilibaChatService.hide(staff.id, messageId, 'Contenu inapproprié', 'test')
    const hidden = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(guest)
    const message = json(hidden).data.find((i: any) => i.id === `m:${messageId}`)
    assert.equal(message.state, 'hidden')
    assert.isNull(message.body)

    const second = await client
      .post(`/api/v1/likilibas/${id}/messages`)
      .loginAs(guest)
      .json({ body: 'Pardon' })
    const secondId = Number(String(json(second).data.id).slice(2))
    const removed = await client
      .delete(`/api/v1/likilibas/${id}/messages/${secondId}`)
      .loginAs(guest)
    assert.equal(removed.status(), 204)
    const final = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(organiser)
    assert.equal(json(final).data.find((i: any) => i.id === `m:${secondId}`).state, 'deleted')

    const outsider = await person()
    const blocked = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(outsider)
    assert.equal(blocked.status(), 404)

    // Profile photos: shown to fellow members, never to anyone else.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    )
    const { ref, mimeType } = await AvatarStorageService.store(png)
    guest.avatarRef = ref
    guest.avatarMimeType = mimeType
    await guest.save()
    const detail = await client.get(`/api/v1/likilibas/${id}`).loginAs(organiser)
    const guestMember = json(detail).data.members.find((m: any) => m.avatar_url)
    assert.match(guestMember.avatar_url, /\/members\/\d+\/avatar\?v=/)
    const photoPath = guestMember.avatar_url.split('?')[0]
    const photo = await client.get(photoPath).loginAs(organiser)
    assert.equal(photo.status(), 200)
    assert.equal(photo.header('content-type'), 'image/png')
    const stranger = await client.get(photoPath).loginAs(outsider)
    assert.equal(stranger.status(), 404)
    const withPhoto = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(organiser)
    const fromGuest = json(withPhoto).data.find((i: any) => i.kind === 'message' && !i.mine)
    assert.equal(fromGuest.author_avatar_url, guestMember.avatar_url)
  })

  test('the organiser edits the group profile: name, description, photo', async ({
    client,
    assert,
  }) => {
    const organiser = await person()
    const guest = await person()
    const outsider = await person()
    const created = await client
      .post('/api/v1/likilibas')
      .loginAs(organiser)
      .json(body({ size: 3 }))
    const id = json(created).data.id
    const invite = await client
      .post(`/api/v1/likilibas/${id}/invitations`)
      .loginAs(organiser)
      .json({ channel: 'account', user_code: guest.code })
    const invitationId = json(invite).data.id
    await client.post(`/api/v1/likilibas/invitations/${invitationId}/accept`).loginAs(guest)
    await client.post(`/api/v1/likilibas/invitations/${invitationId}/admit`).loginAs(organiser)

    const renamed = await client
      .patch(`/api/v1/likilibas/${id}/profile`)
      .loginAs(organiser)
      .json({ name: 'Les amis du marché', description: 'Cotisation entre voisins.' })
    assert.equal(renamed.status(), 200)
    assert.equal(json(renamed).data.name, 'Les amis du marché')
    assert.equal(json(renamed).data.description, 'Cotisation entre voisins.')

    const notOrganiser = await client
      .patch(`/api/v1/likilibas/${id}/profile`)
      .loginAs(guest)
      .json({ name: 'Pirate' })
    assert.equal(notOrganiser.status(), 403)

    const feed = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(guest)
    const event = json(feed).data.find((i: any) => i.event_type === 'profile_updated')
    assert.equal(event.data.name, 'Les amis du marché')
    assert.isTrue(event.data.renamed)

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    )
    const uploaded = await client
      .post(`/api/v1/likilibas/${id}/photo`)
      .loginAs(organiser)
      .file('image', png, { filename: 'group.png' })
    assert.equal(uploaded.status(), 200)
    const photoUrl = json(uploaded).data.photo_url
    assert.match(photoUrl, /\/likilibas\/\d+\/photo\?v=/)

    const seen = await client.get(photoUrl.split('?')[0]).loginAs(guest)
    assert.equal(seen.status(), 200)
    const hidden = await client.get(photoUrl.split('?')[0]).loginAs(outsider)
    assert.equal(hidden.status(), 404)

    const removed = await client.delete(`/api/v1/likilibas/${id}/photo`).loginAs(organiser)
    assert.isNull(json(removed).data.photo_url)
  })
})
