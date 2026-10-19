import UserSignupOtp from '#models/user_signup_otp'
import { SignupOtp } from '#services/security/signup_otp'

export { InvalidOtpException, OTP_TTL_MINUTES } from '#services/security/signup_otp'

const otp = new SignupOtp(UserSignupOtp)

/**
 * Two-step individual signup: POST /auth/signup/request-otp sends a code to the address, and
 * POST /auth/signup must present it before the User row is created — see
 * new_account_controller.ts. Without it, a typo'd or borrowed address would become the only
 * channel for resetting the account's PIN.
 */
export class UserSignupOtpService {
  /** @see SignupOtp.request */
  static requestOtp(email: string): Promise<string> {
    return otp.request(email)
  }

  /** @see SignupOtp.verifyAndConsume */
  static verifyAndConsume(email: string, code: string): Promise<void> {
    return otp.verifyAndConsume(email, code)
  }
}
