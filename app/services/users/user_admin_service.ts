import User from '#models/user'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class UserNotFoundException extends Error {
  constructor() {
    super('User not found')
    this.name = 'UserNotFoundException'
  }
}

export class WalletNotFoundException extends Error {
  constructor() {
    super('Wallet not found for this user')
    this.name = 'WalletNotFoundException'
  }
}

export class WalletStatusException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletStatusException'
  }
}

/**
 * Admin visibility and wallet controls over regular Users. Unlike Business/Agent/InternalUser,
 * the User model itself has NO status column (see user.ts / database/schema.ts) — there is no
 * "suspend the account" concept for a user, only per-wallet status ('active' | 'frozen' |
 * 'closed'), which every money-movement path already enforces (mobile_money_deposit_service.ts,
 * cash_in_service.ts, cash_out_service.ts, float_transfer_service.ts, p2p_transfers_controller.ts
 * all reject a non-'active' wallet). What was missing until now was any admin-facing way to
 * actually SET that status — wallets_controller.ts is entirely self-service (index/store/show
 * scoped to auth.user), with no freeze/unfreeze anywhere.
 */
export class UserAdminService {
  static async search(query?: string): Promise<User[]> {
    const q = User.query().orderBy('id', 'asc')

    if (query) {
      q.where((builder) => {
        builder
          .whereILike('email', `%${query}%`)
          .orWhereILike('full_name', `%${query}%`)
          .orWhereILike('code', `%${query}%`)
      })
    }

    return q
  }

  static async findByIdOrFail(id: number): Promise<User> {
    const user = await User.find(id)
    if (!user) throw new UserNotFoundException()
    return user
  }

  static async listWallets(userId: number): Promise<Wallet[]> {
    return Wallet.query().where('user_id', userId).orderBy('created_at', 'asc')
  }

  private static async findOwnedWalletOrFail(userId: number, walletId: number): Promise<Wallet> {
    const wallet = await Wallet.query().where('id', walletId).where('user_id', userId).first()
    if (!wallet) throw new WalletNotFoundException()
    return wallet
  }

  static async freezeWallet(
    userId: number,
    walletId: number,
    reason: string,
    actorId: number,
    correlationId: string
  ): Promise<Wallet> {
    const wallet = await this.findOwnedWalletOrFail(userId, walletId)

    if (wallet.status === 'frozen') throw new WalletStatusException('Wallet is already frozen')
    if (wallet.status === 'closed') throw new WalletStatusException('Cannot freeze a closed wallet')

    const before = { status: wallet.status }
    wallet.status = 'frozen'
    await wallet.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'wallet.frozen',
      resourceType: 'wallet',
      resourceId: wallet.id,
      before,
      after: { status: 'frozen', reason },
      correlationId,
    })

    return wallet
  }

  /**
   * Admin-forced PIN reset — the fallback path when a user can't complete the self-service
   * email flow (pin_controller.ts requestReset/confirmReset), e.g. lost access to that email
   * entirely. Simply clears the PIN (and any lockout) rather than setting a new one directly:
   * the user still proves ownership of their own *login* session before calling
   * POST /account/pin again, and this way no plaintext PIN of any kind ever passes through an
   * admin's hands. Mirrors InternalUsersService.resetPassword()'s "clear + force reset" shape,
   * except there is no PIN inbox to email a temporary value to — this is admin-initiated, not
   * self-service, so no token/expiry is needed the way requestReset()'s is.
   */
  static async resetPin(userId: number, actorId: number, correlationId: string): Promise<User> {
    const user = await this.findByIdOrFail(userId)
    const before = { pin_set: !!user.pinHash }

    user.pinHash = null
    user.pinAttempts = 0
    user.pinLockedUntil = null
    user.pinResetTokenHash = null
    user.pinResetExpiresAt = null
    await user.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'user.pin_reset_by_admin',
      resourceType: 'user',
      resourceId: user.id,
      before,
      after: { pin_set: false },
      correlationId,
    })

    return user
  }

  static async unfreezeWallet(
    userId: number,
    walletId: number,
    actorId: number,
    correlationId: string
  ): Promise<Wallet> {
    const wallet = await this.findOwnedWalletOrFail(userId, walletId)

    if (wallet.status !== 'frozen')
      throw new WalletStatusException(`Wallet is ${wallet.status}, not frozen`)

    const before = { status: wallet.status }
    wallet.status = 'active'
    await wallet.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId,
      action: 'wallet.unfrozen',
      resourceType: 'wallet',
      resourceId: wallet.id,
      before,
      after: { status: 'active' },
      correlationId,
    })

    return wallet
  }
}
