import BusinessSignupOtp from '#models/business_signup_otp'
import { SignupOtp } from '#services/security/signup_otp'

export { InvalidOtpException } from '#services/security/signup_otp'

const otp = new SignupOtp(BusinessSignupOtp)

/**
 * Two-step business signup: step 1 (request-otp) only takes an email and sends this code; step
 * 2 (the actual signup) requires it alongside the rest of the payload before a Business row is
 * ever created — see business_dashboard/auth_controller.ts. The code mechanics are shared with
 * individual signup: see SignupOtp.
 */
export class BusinessSignupOtpService {
  /** @see SignupOtp.request */
  static requestOtp(email: string): Promise<string> {
    return otp.request(email)
  }

  /** @see SignupOtp.verifyAndConsume */
  static verifyAndConsume(email: string, code: string): Promise<void> {
    return otp.verifyAndConsume(email, code)
  }
}
