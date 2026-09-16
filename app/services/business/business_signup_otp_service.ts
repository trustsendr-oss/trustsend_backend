import { randomInt, createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import BusinessSignupOtp from '#models/business_signup_otp'

export class InvalidOtpException extends Error {
  constructor(message: string = 'Invalid or expired verification code') {
    super(message)
    this.name = 'InvalidOtpException'
  }
}

const OTP_LENGTH = 6
const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex')
}

/**
 * Two-step business signup: step 1 (request-otp) only takes an email and sends this code; step
 * 2 (the actual signup) requires it alongside the rest of the payload before a Business row is
 * ever created — see business_dashboard/auth_controller.ts.
 *
 * A 6-digit code has only ~20 bits of entropy (1,000,000 possibilities) — nowhere near enough to
 * rely on the hash alone the way PinService's 256-bit reset token can. Brute-force resistance
 * here comes from `attempts` (locked out after MAX_ATTEMPTS wrong guesses — the row must be
 * re-requested, not just retried) and a short TTL, not from SHA-256 being slow (it isn't).
 */
export class BusinessSignupOtpService {
  /**
   * Generates and stores a new OTP for `email`, returning the raw code for the caller to
   * deliver by email. Does NOT check whether a Business already exists for this email — the
   * controller does that first (so it can respond with a clear "already registered" message
   * before ever generating a code, since signup — unlike login/password-reset — has no
   * enumeration concern: the whole point is finding out if this email can open a new account).
   */
  static async requestOtp(email: string): Promise<string> {
    const otp = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0')

    await BusinessSignupOtp.create({
      email,
      otpHash: hashOtp(otp),
      attempts: 0,
      expiresAt: DateTime.now().plus({ minutes: OTP_TTL_MINUTES }),
      consumedAt: null,
    })

    return otp
  }

  /**
   * Verifies `otp` against the most recently requested, not-yet-consumed code for `email`, and
   * marks it consumed on success (single-use). Every failed attempt (wrong code OR none pending)
   * increments the attempt counter on the latest row so repeated guessing against the same code
   * is bounded, even across separate HTTP requests.
   *
   * @throws InvalidOtpException if there's no pending code, it's expired, attempts are
   *   exhausted, or the code doesn't match.
   */
  static async verifyAndConsume(email: string, otp: string): Promise<void> {
    const pending = await BusinessSignupOtp.query()
      .where('email', email)
      .whereNull('consumed_at')
      .orderBy('created_at', 'desc')
      .first()

    if (!pending) {
      throw new InvalidOtpException()
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      throw new InvalidOtpException('Too many attempts — request a new verification code')
    }

    if (pending.expiresAt < DateTime.now()) {
      throw new InvalidOtpException('Verification code has expired — request a new one')
    }

    if (pending.otpHash !== hashOtp(otp)) {
      pending.attempts += 1
      await pending.save()
      throw new InvalidOtpException()
    }

    pending.consumedAt = DateTime.now()
    await pending.save()
  }
}
