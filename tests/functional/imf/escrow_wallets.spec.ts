import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import User from '#models/user'

/**
 * `wallets.purpose` exists so money placed with an institution can leave a holder's spendable
 * balance without leaving TumaPlus's custody.
 *
 * The danger it introduces is that a second wallet now answers to the same (owner, currency) pair,
 * so any resolver that picks "the" wallet with `.first()` could hand a money path someone's locked
 * savings. Every such resolver was narrowed with the `Wallet.primary` scope; these tests hold that
 * line, because nothing else would catch a regression until real savings existed to be spent.
 */
test.group('Escrow wallets and the primary scope', (group) => {
  const createdUserIds: number[] = []

  group.each.teardown(async () => {
    for (const id of createdUserIds) {
      const wallets = await db.from('wallets').where('user_id', id).select('ledger_account_id')
      await db.from('wallets').where('user_id', id).delete()
      await db
        .from('ledger_accounts')
        .whereIn(
          'id',
          wallets.map((w) => w.ledger_account_id)
        )
        .delete()
      await db.from('users').where('id', id).delete()
    }
    createdUserIds.length = 0
  })

  async function makeUser(suffix: string) {
    const user = await User.create({
      email: `escrow${suffix}@example.test`,
      password: 'secret-password',
      fullName: `Escrow Tester ${suffix}`,
    })
    createdUserIds.push(user.id)
    await UserOnboardingService.createDefaultWallet(user.id, 'USD', `test-escrow-${suffix}`)
    return user
  }

  async function makeEscrowWallet(userId: number, suffix: string) {
    const account = await LedgerAccount.create({
      code: `USER_ESCROW.${userId}.USD.${suffix}`,
      name: `USD escrow for user ${userId}`,
      accountType: 'asset',
      ownerType: 'user_wallet',
      currencyCode: 'USD',
      status: 'active',
    })
    const wallet = await Wallet.create({
      userId,
      ledgerAccountId: account.id,
      currencyCode: 'USD',
      balanceCache: 0n,
      purpose: 'escrow',
      status: 'active',
    })
    account.ownerId = wallet.id
    await account.save()
    return wallet
  }

  test('a wallet is created as its owner primary wallet', async ({ assert }) => {
    const user = await makeUser(`${Date.now()}`.slice(-8))
    const wallet = await Wallet.query().where('user_id', user.id).firstOrFail()

    assert.equal(wallet.purpose, 'primary')
  })

  test('a user can hold an escrow wallet alongside a primary one in the same currency', async ({
    assert,
  }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await makeUser(suffix)
    await makeEscrowWallet(user.id, suffix)

    const all = await Wallet.query().where('user_id', user.id).where('currency_code', 'USD')
    assert.lengthOf(all, 2)
  })

  test('two primary wallets in one currency are still refused', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await makeUser(suffix)

    await assert.rejects(async () => {
      const account = await LedgerAccount.create({
        code: `USER_DUP.${user.id}.USD.${suffix}`,
        name: 'duplicate primary',
        accountType: 'asset',
        ownerType: 'user_wallet',
        currencyCode: 'USD',
        status: 'active',
      })
      await Wallet.create({
        userId: user.id,
        ledgerAccountId: account.id,
        currencyCode: 'USD',
        balanceCache: 0n,
        purpose: 'primary',
        status: 'active',
      })
    })
  })

  test('the primary scope never resolves an escrow wallet', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await makeUser(suffix)
    const escrow = await makeEscrowWallet(user.id, suffix)

    // Escrow created last, so an unscoped `.first()` is free to return it — which is exactly the
    // failure this scope exists to prevent on every money path.
    const resolved = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', user.id)
      .where('currency_code', 'USD')
      .where('status', 'active')
      .first()

    assert.isNotNull(resolved)
    assert.notEqual(resolved!.id, escrow.id)
    assert.equal(resolved!.purpose, 'primary')
  })

  test('onboarding stays idempotent and never adopts an escrow wallet', async ({ assert }) => {
    const suffix = `${Date.now()}`.slice(-8)
    const user = await makeUser(suffix)
    const primary = await Wallet.query().where('user_id', user.id).firstOrFail()
    const escrow = await makeEscrowWallet(user.id, suffix)

    const again = await UserOnboardingService.createDefaultWallet(
      user.id,
      'USD',
      `test-escrow-again-${suffix}`
    )

    assert.equal(again.id, primary.id)
    assert.notEqual(again.id, escrow.id)

    const total = await Wallet.query().where('user_id', user.id).where('currency_code', 'USD')
    assert.lengthOf(total, 2)
  })
})
