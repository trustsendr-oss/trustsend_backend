import { BaseCommand, args } from '@adonisjs/core/ace'
import { BusinessSignupOtpService } from '#services/business/business_signup_otp_service'

export default class GenOtp extends BaseCommand {
  static commandName = 'gen:otp'
  static options = { startApp: true }

  @args.string()
  declare email: string

  async run() {
    const otp = await BusinessSignupOtpService.requestOtp(this.email)
    console.log(otp)
  }
}
