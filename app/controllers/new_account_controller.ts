import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { requestSignupOtpValidator, signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { IdGenerator } from '#services/security/id_generator'
import {
  InvalidOtpException,
  OTP_TTL_MINUTES,
  UserSignupOtpService,
} from '#services/users/user_signup_otp_service'
import { NotificationService } from '#services/notifications/notification_service'

const MAX_CODE_GENERATION_ATTEMPTS = 5

export default class NewAccountController {
  /**
   * POST /api/v1/auth/signup/request-otp
   * Step 1 of signup: sends a 6-digit code to the address. Signup has no enumeration concern
   * (finding out whether this address can open an account is the point), so a taken address is
   * refused plainly before any code is generated — same as business signup.
   */
  async requestOtp({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(requestSignupOtpValidator)

    const existing = await User.findBy('email', email)
    if (existing) {
      return response.conflict({
        code: 'EMAIL_TAKEN',
        message: 'An account already exists for this email. Try logging in instead.',
      })
    }

    const otp = await UserSignupOtpService.requestOtp(email)

    // Unlike notifications about a completed operation, this email IS the operation: if it
    // didn't leave, the client must say so instead of waiting for a code that will never come.
    const sent = await NotificationService.sendEmail({
      to: email,
      subject: 'Vérifiez votre adresse e-mail',
      template: 'user_signup_otp',
      data: { otp, expires_in_minutes: OTP_TTL_MINUTES },
    })
    if (!sent) {
      return response.serviceUnavailable({
        code: 'EMAIL_NOT_SENT',
        message: 'The verification email could not be sent. Try again in a moment.',
      })
    }

    return response.ok({
      message: 'Verification code sent. Check your email, then complete signup.',
      expiresIn: OTP_TTL_MINUTES * 60,
    })
  }

  /**
   * POST /api/v1/auth/signup
   * Step 2: the account itself, gated on the code from step 1.
   */
  async store({ request, response, serialize }: HttpContext) {
    const { fullName, email, password, otp } = await request.validateUsing(signupValidator)

    try {
      await UserSignupOtpService.verifyAndConsume(email, otp)
    } catch (error) {
      if (error instanceof InvalidOtpException) {
        return response.badRequest({ code: error.code, message: error.message })
      }
      throw error
    }

    const code = await this.generateUniqueCode()

    // Atomic: a wallet-creation failure must not leave a User row with no wallet and no way to
    // retry signup (email/code already taken). See UserOnboardingService.createDefaultWallet —
    // it opens its own db.transaction() when called standalone, so it's passed `trx` here to
    // join this same transaction instead.
    const user = await db.transaction(async (trx) => {
      const user = await User.create({ fullName, email, password, code }, { client: trx })
      await UserOnboardingService.createDefaultWallet(user.id, 'USD', undefined, trx)
      return user
    })

    // expiresIn matches every other login path (access_tokens_controller.ts,
    // internal_auth_controller.ts, business_dashboard/auth_controller.ts all use '1h') — without
    // it, this was the only token in the system that never expired.
    const token = await User.accessTokens.create(user, ['*'], { expiresIn: '1h' })

    return serialize({
      user: UserTransformer.transform(user),
      token: token.value!.release(),
      expiresIn: 3600,
    })
  }

  /**
   * Generates a 9-digit numeric code, retrying on the rare collision against the unique
   * `users.code` column instead of letting a raw DB constraint error surface from `.create()`.
   */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const candidate = IdGenerator.generateNumericCode()
      const existing = await User.findBy('code', candidate)
      if (!existing) {
        return candidate
      }
    }
    throw new Error('Unable to generate a unique user code after several attempts')
  }
}
