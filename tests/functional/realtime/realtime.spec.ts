import { test } from '@japa/runner'
import { randomInt, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import transmit from '@adonisjs/transmit/services/main'
import KycVerification from '#models/kyc_verification'
import { PinService } from '#services/security/pin_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import env from '#start/env'
import User from '#models/user'
import { Realtime } from '#services/realtime/realtime'
import { createUserWithWallet, TEST_PIN } from '#tests/helpers/user_helper'

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}/api/v1/__transmit`

/** Opens a real SSE stream as `user`, like the app does. */
async function openStream(user: User, uid: string) {
  const token = await User.accessTokens.create(user)
  const controller = new AbortController()
  const response = await fetch(`${base()}/events?uid=${uid}`, {
    headers: { Authorization: `Bearer ${token.value!.release()}`, Accept: 'text/event-stream' },
    signal: controller.signal,
  })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  /** Reads frames until one contains `needle`, or gives up after `ms`. */
  async function waitFor(needle: string, ms = 3000): Promise<string> {
    let seen = ''
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), deadline - Date.now())),
      ])
      if (!chunk || chunk.done) break
      seen += decoder.decode(chunk.value)
      if (seen.includes(needle)) return seen
    }
    return seen
  }

  return { response, waitFor, close: () => controller.abort() }
}

test.group('Realtime (Server-Sent Events)', () => {
  test('the event stream is for signed-in users only', async ({ client }) => {
    const anonymous = await client.get(`/api/v1/__transmit/events?uid=${randomUUID()}`)
    anonymous.assertStatus(401)
  })

  test('a malformed connection id is refused', async ({ client }) => {
    const { user } = await createUserWithWallet({ email: `rt-uid-${randomUUID()}@test.com` })
    const res = await client
      .post('/api/v1/__transmit/subscribe')
      .loginAs(user)
      .json({ uid: 'x', channel: `users/${user.id}` })
    res.assertStatus(400)
  })

  test("a stream hears its owner's events, and only them", async ({ client, assert }) => {
    const { user } = await createUserWithWallet({ email: `rt-own-${randomUUID()}@test.com` })
    const { user: other } = await createUserWithWallet({
      email: `rt-other-${randomUUID()}@test.com`,
    })
    const uid = randomUUID()
    const stream = await openStream(user, uid)
    try {
      assert.equal(stream.response.status, 200)
      assert.include(stream.response.headers.get('content-type') ?? '', 'text/event-stream')
      assert.equal(stream.response.headers.get('x-accel-buffering'), 'no')
      assert.include(await stream.waitFor(':ok'), ':ok')

      // Someone else's channel is refused, even on one's own stream.
      const foreign = await client
        .post('/api/v1/__transmit/subscribe')
        .loginAs(user)
        .json({ uid, channel: `users/${other.id}` })
      foreign.assertStatus(400)

      // Subscribed to its own channel on connect: no /subscribe call needed.
      Realtime.toUser(other.id, { type: 'wallet.updated' })
      Realtime.toUser(user.id, { type: 'crypto_deposit.updated', id: 42, status: 'credited' })
      const frames = await stream.waitFor('crypto_deposit.updated')
      assert.include(frames, `"channel":"users/${user.id}"`)
      assert.include(frames, '"type":"crypto_deposit.updated"')
      assert.notInclude(frames, `users/${other.id}`)
    } finally {
      stream.close()
    }
  })

  test("the same connection id used by another user never reaches the first one's stream", async ({
    assert,
  }) => {
    const { user } = await createUserWithWallet({ email: `rt-ns-${randomUUID()}@test.com` })
    const { user: intruder } = await createUserWithWallet({
      email: `rt-ns2-${randomUUID()}@test.com`,
    })
    const uid = randomUUID()
    const victim = await openStream(user, uid)
    const attacker = await openStream(intruder, uid) // same id, guessed or copied
    try {
      await victim.waitFor(':ok')
      await attacker.waitFor(':ok')
      Realtime.toUser(user.id, { type: 'wallet.updated' })

      assert.include(await victim.waitFor('wallet.updated'), 'wallet.updated')
      assert.notInclude(await attacker.waitFor('wallet.updated', 800), 'wallet.updated')
    } finally {
      victim.close()
      attacker.close()
    }
  })
})

test.group('Realtime — likiliba', () => {
  const json = (res: { body(): unknown }) => res.body() as any

  async function person() {
    const user = await User.create({
      fullName: `Membre ${randomInt(1000, 9999)}`,
      email: `rt-lk-${randomUUID()}@example.test`,
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

  /** Records `likiliba.updated` events per user while `run` executes. */
  async function listen(run: () => Promise<void>) {
    const heard = new Map<string, number>()
    const stop = transmit.on('broadcast', ({ channel, payload }) => {
      if ((payload as any)?.type === 'likiliba.updated')
        heard.set(channel, (heard.get(channel) ?? 0) + 1)
    })
    try {
      await run()
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stop()
    }
    return heard
  }

  test('every member hears about messages, reactions and group events; outsiders and read marks stay silent', async ({
    client,
    assert,
  }) => {
    const organiser = await person()
    const guest = await person()
    const outsider = await person()

    const created = await client
      .post('/api/v1/likilibas')
      .loginAs(organiser)
      .json({
        name: 'Likiliba temps réel',
        currency_code: 'CDF',
        contribution_amount: '500000',
        frequency: 'weekly',
        size: 3,
        starts_at: DateTime.now().plus({ days: 3 }).toISO(),
        caution_required: false,
        penalty_mode: 'percent',
        penalty_daily_bps: 100,
        penalty_cap_bps: 1000,
        ordering_mode: 'draw',
      })
    const id = json(created).data.id

    // A group event (journal): the guest joining is announced to the members.
    const joined = await listen(async () => {
      await client
        .post(`/api/v1/likilibas/${id}/invitations`)
        .loginAs(organiser)
        .json({ channel: 'account', user_code: guest.code })
      const invitations = await client.get('/api/v1/likilibas/invitations').loginAs(guest)
      const invitation = json(invitations).data.find((i: any) => i.likiliba.id === id)
      await client.post(`/api/v1/likilibas/invitations/${invitation.id}/accept`).loginAs(guest)
      await client.post(`/api/v1/likilibas/invitations/${invitation.id}/admit`).loginAs(organiser)
    })
    assert.isAbove(joined.get(`users/${organiser.id}`) ?? 0, 0)

    const sent = await listen(async () => {
      const res = await client
        .post(`/api/v1/likilibas/${id}/messages`)
        .loginAs(guest)
        .json({ body: 'Bonjour à tous' })
      assert.equal(res.status(), 201)
    })
    assert.equal(sent.get(`users/${organiser.id}`), 1)
    assert.equal(sent.get(`users/${guest.id}`), 1) // the author's other devices too
    assert.isUndefined(sent.get(`users/${outsider.id}`))

    const feed = await client.get(`/api/v1/likilibas/${id}/feed`).loginAs(organiser)
    const messageId = Number(
      String(json(feed).data.find((item: any) => item.kind === 'message').id).slice(2)
    ) // feed ids read `m:123`

    const reacted = await listen(async () => {
      await client
        .put(`/api/v1/likilibas/${id}/messages/${messageId}/reaction`)
        .loginAs(organiser)
        .json({ emoji: '👍' })
    })
    assert.equal(reacted.get(`users/${guest.id}`), 1)

    // Marking read happens on every refresh: announcing it would loop between members.
    const read = await listen(async () => {
      await client.post(`/api/v1/likilibas/${id}/read`).loginAs(guest)
    })
    assert.equal(read.size, 0)
  })
})

test.group('Realtime — money movements', () => {
  test('a transfer tells both the sender and the recipient that their balance moved', async ({
    client,
    assert,
  }) => {
    const sender = await createUserWithWallet({
      email: `rt-p2p-s-${randomUUID()}@test.com`,
      balance: 100000n,
    })
    const recipient = await createUserWithWallet({
      email: `rt-p2p-r-${randomUUID()}@test.com`,
      balance: 0n,
    })
    const bystander = await createUserWithWallet({
      email: `rt-p2p-b-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const heard = new Set<string>()
    const stop = transmit.on('broadcast', ({ channel, payload }) => {
      if ((payload as any)?.type === 'wallet.updated') heard.add(channel)
    })
    try {
      const res = await client.post('/api/v1/transfers/p2p').loginAs(sender.user).json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '25000',
        currency_code: 'USD',
        idempotency_key: randomUUID(),
        pin: TEST_PIN,
      })
      assert.equal(res.status(), 201)
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stop()
    }

    assert.isTrue(heard.has(`users/${sender.user.id}`))
    assert.isTrue(heard.has(`users/${recipient.user.id}`))
    assert.isFalse(heard.has(`users/${bystander.user.id}`))
  })

  test('nothing is announced when the money movement rolls back', async ({ client, assert }) => {
    const sender = await createUserWithWallet({
      email: `rt-rb-s-${randomUUID()}@test.com`,
      balance: 1000n,
    })
    const recipient = await createUserWithWallet({
      email: `rt-rb-r-${randomUUID()}@test.com`,
      balance: 0n,
    })

    const heard: string[] = []
    const stop = transmit.on('broadcast', ({ channel }) => {
      heard.push(channel)
    })
    try {
      const res = await client.post('/api/v1/transfers/p2p').loginAs(sender.user).json({
        recipient_wallet_id: recipient.wallet.id,
        amount: '50000', // more than the balance
        currency_code: 'USD',
        idempotency_key: randomUUID(),
        pin: TEST_PIN,
      })
      assert.isAtLeast(res.status(), 400)
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stop()
    }
    assert.notInclude(heard, `users/${recipient.user.id}`)
  })
})

test.group('Realtime — status of records', () => {
  async function heardDuring(run: () => Promise<void>) {
    const heard: Array<{ channel: string; payload: any }> = []
    const stop = transmit.on('broadcast', (event) => {
      heard.push(event as any)
    })
    try {
      await run()
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stop()
    }
    return heard
  }

  test('a new in-app notification refreshes the list', async ({ assert }) => {
    const { user } = await createUserWithWallet({ email: `rt-notif-${randomUUID()}@test.com` })
    const heard = await heardDuring(async () => {
      await InAppNotificationService.notify({
        recipientType: 'user',
        recipientId: user.id,
        type: 'test',
        title: 'Test',
        message: 'Bonjour',
      })
    })
    assert.deepInclude(heard, {
      channel: `users/${user.id}`,
      payload: { type: 'notification.created' },
    })
  })

  test('an identity decision is announced, an untouched status is not', async ({ assert }) => {
    const { user } = await createUserWithWallet({ email: `rt-kyc-${randomUUID()}@test.com` })
    const kyc = new KycVerification()
    kyc.subjectType = 'user'
    kyc.subjectId = user.id
    kyc.verificationType = 'document'
    kyc.status = 'pending'
    kyc.submittedAt = DateTime.now()
    await kyc.save()

    const decided = await heardDuring(async () => {
      kyc.status = 'approved'
      kyc.decidedAt = DateTime.now()
      await kyc.save()
    })
    assert.deepInclude(decided, {
      channel: `users/${user.id}`,
      payload: { type: 'kyc.updated', status: 'approved' },
    })

    const untouched = await heardDuring(async () => {
      kyc.decidedAt = DateTime.now()
      await kyc.save()
    })
    assert.lengthOf(
      untouched.filter((event) => event.payload?.type === 'kyc.updated'),
      0
    )
  })
})
