import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { IdGenerator } from '#services/security/id_generator'

const MAX_CODE_GENERATION_ATTEMPTS = 5

export default class NewAccountController {
  async store({ request, serialize }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(signupValidator)

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
