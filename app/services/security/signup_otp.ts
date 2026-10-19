import { randomInt, createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import type BusinessSignupOtp from '#models/business_signup_otp'
import type UserSignupOtp from '#models/user_signup_otp'

export type InvalidOtpCode = 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_LOCKED'

export class InvalidOtpException extends Error {
  constructor(
    message: string = 'Invalid or expired verification code',
    /** Lets clients phrase the failure in their own language without parsing `message`. */
    readonly code: InvalidOtpCode = 'OTP_INVALID'
  ) {
    super(message)
    this.name = 'InvalidOtpException'
  }
}

export const OTP_LENGTH = 6
export const OTP_TTL_MINUTES = 10
const MAX_ATTEMPTS = 5

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex')
}

/** Both signup flows (business, individual) store their codes in identically shaped tables. */
type SignupOtpModel = typeof BusinessSignupOtp | typeof UserSignupOtp

/**
 * Email-ownership check shared by every self-service signup: step 1 sends a 6-digit code to the
 * address, step 2 (the actual signup) must present it before any account row is created.
 *
 * A 6-digit code has only ~20 bits of entropy (1,000,000 possibilities) — nowhere near enough to
 * rely on the hash alone the way PinService's 256-bit reset token can. Brute-force resistance
 * here comes from `attempts` (locked out after MAX_ATTEMPTS wrong guesses — the row must be
 * re-requested, not just retried) and a short TTL, not from SHA-256 being slow (it isn't).
 */
export class SignupOtp {
  constructor(private readonly model: SignupOtpModel) {}

  /**
   * Generates and stores a new OTP for `email`, returning the raw code for the caller to
   * deliver by email. Does NOT check whether an account already exists for this email — the
   * controller does that first, so it can answer "already registered" before generating a code.
   */
  async request(email: string): Promise<string> {
    const otp = randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0')

    await this.model.create({
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
  async verifyAndConsume(email: string, otp: string): Promise<void> {
    const pending = await this.model
      .query()
      .where('email', email)
      .whereNull('consumed_at')
      .orderBy('created_at', 'desc')
      .first()

    if (!pending) {
      throw new InvalidOtpException()
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      throw new InvalidOtpException(
        'Too many attempts — request a new verification code',
        'OTP_LOCKED'
      )
    }

    if (pending.expiresAt < DateTime.now()) {
      throw new InvalidOtpException(
        'Verification code has expired — request a new one',
        'OTP_EXPIRED'
      )
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
