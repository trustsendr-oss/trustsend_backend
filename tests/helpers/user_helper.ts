import User from '#models/user'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import db from '@adonisjs/lucid/services/db'
import { PinService } from '#services/security/pin_service'

/** Default PIN set on test users created via createUserWithWallet, unless `pin: null` is passed. */
export const TEST_PIN = '1234'

interface CreateUserWithWalletOptions {
  email: string
  password?: string
  balance?: bigint
  perTransactionLimit?: bigint
  dailyLimit?: bigint
  /** Defaults to TEST_PIN. Pass null to leave the PIN unset. */
  pin?: string | null
}

/**
 * Create a test user with a wallet and ledger account
 */
export async function createUserWithWallet(options: CreateUserWithWalletOptions) {
  return db.transaction(async (trx) => {
    // Create user
    const user = await User.create(
      {
        fullName: `Test User ${options.email}`,
        email: options.email,
        password: options.password || 'password123',
      },
      { client: trx }
    )

    const pin = options.pin === undefined ? TEST_PIN : options.pin
    if (pin !== null) {
      await PinService.setPin(user, pin)
    }

    // Create ledger account (USD by default)
    const ledgerAccount = new LedgerAccount()
    ledgerAccount.code = `USER_WALLET.${user.id}.USD`
    ledgerAccount.name = `USD Wallet for ${user.email}`
    ledgerAccount.accountType = 'asset'
    ledgerAccount.ownerType = 'user_wallet'
    ledgerAccount.ownerId = null // Will be set after wallet creation
    ledgerAccount.currencyCode = 'USD'
    ledgerAccount.status = 'active'

    await ledgerAccount.useTransaction(trx).save()

    // Create wallet (USD by default)
    const wallet = new Wallet()
    wallet.userId = user.id
    wallet.ledgerAccountId = ledgerAccount.id
    wallet.currencyCode = 'USD'
    wallet.balanceCache = options.balance || 0n
    wallet.perTransactionLimit = options.perTransactionLimit || null
    wallet.dailyLimit = options.dailyLimit || null
    wallet.status = 'active'

    await wallet.useTransaction(trx).save()

    // Update ledger account to reference wallet
    ledgerAccount.ownerId = wallet.id
    await ledgerAccount.useTransaction(trx).save()

    return {
      user,
      wallet,
      ledgerAccount,
    }
  })
}

/**
 * Clean up test data
 */
export async function cleanupTestData() {
  // Delete in reverse order of creation
  await db.from('ledger_entries').delete()
  await db.from('ledger_transactions').delete()
  await db.from('access_tokens').delete()
  await db.from('wallets').delete()
  await db.from('ledger_accounts').delete()
  await db.from('users').delete()
}
