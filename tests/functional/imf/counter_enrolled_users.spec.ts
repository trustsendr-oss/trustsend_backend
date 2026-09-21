import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

/**
 * A holder enrolled at an IMF counter has no e-mail and no password: they are identified by their
 * 9-digit code and authorised by their PIN.
 *
 * The security question this raises is what happens when someone tries to log in as one of them.
 * The auth mixin's own verifyPassword throws a RuntimeException on a null password column, which
 * would answer with a 500 where every other failed login answers with the same generic rejection —
 * enough of a difference to enumerate which accounts exist. User.verifyPassword overrides that to
 * fail closed; these tests are what keeps it closed.
 */
test.group('Counter-enrolled users', (group) => {
  const createdIds: number[] = []

  group.each.teardown(async () => {
    await db.from('users').whereIn('id', createdIds).delete()
    createdIds.length = 0
  })

  async function makeCounterUser(suffix: string) {
    const user = await User.create({
      fullName: `Mama Ngalula ${suffix}`,
      code: suffix.padStart(9, '0').slice(0, 9),
      email: null,
      password: null,
    })
    createdIds.push(user.id)
    return user
  }

  test('a holder can be enrolled with neither an email nor a password', async ({ assert }) => {
    const user = await makeCounterUser(`${Date.now()}`.slice(-8))

    const stored = await User.findOrFail(user.id)
    assert.isNull(stored.email)
    assert.isNull(stored.password)
    assert.isNotNull(stored.code)
  })

  test('several counter-enrolled holders coexist despite the unique email index', async ({
    assert,
  }) => {
    const base = `${Date.now()}`.slice(-8)
    const first = await makeCounterUser(base)
    const second = await makeCounterUser(`${Number(base) + 1}`)

    assert.notEqual(first.id, second.id)
    assert.isNull(first.email)
    assert.isNull(second.email)
  })

  test('a passwordless account refuses a password check instead of throwing', async ({
    assert,
  }) => {
    const user = await makeCounterUser(`${Date.now()}`.slice(-8))

    // The unpatched mixin raises a RuntimeException here, which would surface as a 500.
    const verified = await user.verifyPassword('whatever-they-guessed')
    assert.isFalse(verified)
  })

  test('verifyCredentials rejects a passwordless account as invalid credentials', async ({
    assert,
  }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await makeCounterUser(suffix)

    // Give it an address but still no password — the closest an attacker gets to a real target.
    user.email = `counter${suffix}@example.test`
    await user.save()

    await assert.rejects(
      () => User.verifyCredentials(`counter${suffix}@example.test`, 'guessed-password'),
      'Invalid user credentials'
    )
  })

  test('initials fall back to the name, then the code, and never throw', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const named = await makeCounterUser(suffix)
    assert.equal(named.initials, 'MN')

    named.fullName = null
    assert.equal(named.initials, named.code!.slice(0, 2))

    named.code = null
    assert.equal(named.initials, '')
  })

  test('an ordinary account still authenticates normally', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await User.create({
      fullName: 'Ordinary Holder',
      email: `ordinary${suffix}@example.test`,
      password: 'a-real-password',
    })
    createdIds.push(user.id)

    const verified = await User.verifyCredentials(
      `ordinary${suffix}@example.test`,
      'a-real-password'
    )
    assert.equal(verified.id, user.id)
    assert.equal(verified.initials, 'OH')
  })
})
