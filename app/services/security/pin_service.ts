import { createHash, randomBytes } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import { DateTime } from 'luxon'

/**
 * Structural type instead of `User` directly — User and Business both have the same three PIN
 * columns and a Lucid `.save()`, so this one service covers both without duplicating logic.
 */
export interface PinnableAccount {
  pinHash: string | null
  pinAttempts: number
  pinLockedUntil: DateTime | null
  save(): Promise<this>
}

/**
 * Extends PinnableAccount with the reset-token columns — a separate, wider interface (rather
 * than adding these fields to PinnableAccount itself) so verifyPin()/setPin() keep working
 * against anything with just the three original PIN columns, without forcing every caller to
 * also carry reset-token fields it doesn't need.
 */
export interface PinResettableAccount extends PinnableAccount {
  pinResetTokenHash: string | null
  pinResetExpiresAt: DateTime | null
}

const RESET_TOKEN_BYTES = 32 // 256 bits — hashed with SHA-256 below, not scrypt: this is a
// high-entropy random token, not a low-entropy secret a human chose, so a fast hash is fine and
// lets verification stay cheap (no brute-force risk to mitigate with a slow hash).
const RESET_TOKEN_TTL_MINUTES = 30

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Why a PIN check failed, in a form a client can branch on without parsing English.
 * `PIN_*` failures are NOT authentication failures: the caller's session is fine.
 */
export type PinVerificationCode = 'PIN_OK' | 'PIN_NOT_SET' | 'PIN_INVALID' | 'PIN_LOCKED'

export class PinService {
  /**
   * Hash a PIN for storage
   */
  static async hashPin(pin: string): Promise<string> {
    return await hash.make(pin)
  }

  /**
   * Verify an account's PIN (User or Business).
   *
   * `code` exists because every caller reports a failure here as 401, which any correct HTTP
   * client reads as "your session is dead" and acts on by signing the user out — a wrong PIN
   * would log them out instead of telling them the PIN was wrong. The status stays 401 for
   * backwards compatibility; `code` is what lets a client tell the two apart.
   */
  static async verifyPin(
    user: PinnableAccount,
    pin: string
  ): Promise<{ valid: boolean; message: string; code: PinVerificationCode }> {
    // Check if account is locked
    if (user.pinLockedUntil && user.pinLockedUntil > DateTime.now()) {
      const minutesLeft = Math.ceil(user.pinLockedUntil.diffNow('minutes').minutes)
      return {
        valid: false,
        code: 'PIN_LOCKED',
        message: `PIN locked for ${minutesLeft} more minutes due to too many failed attempts`,
      }
    }

    // Check if PIN is set
    if (!user.pinHash) {
      return {
        valid: false,
        code: 'PIN_NOT_SET',
        message: 'PIN not set. Please set a PIN first.',
      }
    }

    // Verify PIN
    const isValid = await hash.verify(user.pinHash, pin)

    if (!isValid) {
      // Increment failed attempts
      user.pinAttempts = (user.pinAttempts || 0) + 1

      // Lock account after 3 failed attempts for 15 minutes
      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = DateTime.now().plus({ minutes: 15 })
      }

      await user.save()

      const remainingAttempts = Math.max(0, 3 - user.pinAttempts)
      return {
        valid: false,
        code: 'PIN_INVALID',
        message: `Invalid PIN. ${remainingAttempts} attempts remaining.`,
      }
    }

    // Reset attempts on success
    user.pinAttempts = 0
    user.pinLockedUntil = null
    await user.save()

    return {
      valid: true,
      code: 'PIN_OK',
      message: 'PIN verified',
    }
  }

  /**
   * Set/Change PIN for user
   */
  static async setPin(user: PinnableAccount, newPin: string): Promise<void> {
    // Validate PIN format (exactly 4 digits)
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('PIN must be exactly 4 digits')
    }

    user.pinHash = await this.hashPin(newPin)
    user.pinAttempts = 0
    user.pinLockedUntil = null
    await user.save()
  }

  /**
   * Check if PIN is set
   */
  static isPinSet(user: PinnableAccount): boolean {
    return !!user.pinHash
  }

  /**
   * Reset PIN attempts (for admin use)
   */
  static async resetAttempts(user: PinnableAccount): Promise<void> {
    user.pinAttempts = 0
    user.pinLockedUntil = null
    await user.save()
  }

  /**
   * Self-service "forgot my PIN" — step 1. Generates a one-time reset token, stores only its
   * hash (so a DB read alone can't be used to reset the PIN), and returns the raw token for the
   * caller to deliver out-of-band (email/SMS — see NotificationService). Always call this even
   * if the account might not exist / might not have requested it: the caller must return the
   * same generic response either way to avoid confirming or denying account existence.
   */
  static async requestReset(account: PinResettableAccount): Promise<string> {
    const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url')
    account.pinResetTokenHash = hashResetToken(token)
    account.pinResetExpiresAt = DateTime.now().plus({ minutes: RESET_TOKEN_TTL_MINUTES })
    await account.save()
    return token
  }

  /**
   * Self-service "forgot my PIN" — step 2. Verifies the token (constant-time comparison via
   * hash equality — SHA-256 output length is fixed, so a plain string comparison here isn't the
   * timing side-channel it would be for comparing raw secrets of variable/attacker-known length)
   * and, if valid, sets the new PIN and clears both the reset token and any lockout — a
   * successful reset is itself proof of ownership, there's no reason to keep an old lockout.
   *
   * @throws Error if the token is missing, expired, or doesn't match.
   */
  static async confirmReset(
    account: PinResettableAccount,
    token: string,
    newPin: string
  ): Promise<void> {
    if (
      !account.pinResetTokenHash ||
      !account.pinResetExpiresAt ||
      account.pinResetExpiresAt < DateTime.now() ||
      account.pinResetTokenHash !== hashResetToken(token)
    ) {
      throw new Error('Invalid or expired reset token')
    }

    account.pinResetTokenHash = null
    account.pinResetExpiresAt = null
    await this.setPin(account, newPin)
  }
}
