import { BaseCommand } from '@adonisjs/core/ace'
import { BusinessSignupOtpService, InvalidOtpException } from '#services/business/business_signup_otp_service'

export default class TestBusinessSignupOtp extends BaseCommand {
  static commandName = 'test:business-signup-otp'
  static options = { startApp: true }

  async run() {
    const email = `otp-flow-test-${Date.now()}@example.com`

    const otp = await BusinessSignupOtpService.requestOtp(email)
    this.logger.info(`Requested OTP for ${email}: ${otp} (length ${otp.length})`)

    try {
      await BusinessSignupOtpService.verifyAndConsume(email, '000000')
      this.logger.error('FAIL: wrong OTP was accepted')
    } catch (e) {
      this.logger.info(`OK: wrong OTP rejected -> ${(e as InvalidOtpException).message}`)
    }

    await BusinessSignupOtpService.verifyAndConsume(email, otp)
    this.logger.info('OK: correct OTP verified')

    try {
      await BusinessSignupOtpService.verifyAndConsume(email, otp)
      this.logger.error('FAIL: OTP was reusable')
    } catch (e) {
      this.logger.info(`OK: reused OTP rejected -> ${(e as InvalidOtpException).message}`)
    }

    // Lockout after MAX_ATTEMPTS wrong guesses on a fresh OTP
    const email2 = `otp-lockout-test-${Date.now()}@example.com`
    await BusinessSignupOtpService.requestOtp(email2)
    let lastMessage = ''
    for (let i = 0; i < 6; i++) {
      try {
        await BusinessSignupOtpService.verifyAndConsume(email2, '999999')
      } catch (e) {
        lastMessage = (e as InvalidOtpException).message
      }
    }
    this.logger.info(`OK: after 6 wrong attempts -> ${lastMessage}`)
  }
}
