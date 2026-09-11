import { BaseCommand, args } from '@adonisjs/core/ace'
import { BusinessSignupOtpService } from '#services/business/business_signup_otp_service'

export default class GenBizOtp3 extends BaseCommand {
  static commandName = 'gen:biz-otp3'
  static options = { startApp: true }

  @args.string()
  declare email: string

  async run() {
    const otp = await BusinessSignupOtpService.requestOtp(this.email)
    console.log(otp)
  }
}
