import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { DateTime } from 'luxon'

export default class User extends compose(UserSchema, withAuthFinder(() => hash.use())) {
  static accessTokens = DbAccessTokensProvider.forModel(User)
  declare currentAccessToken?: AccessToken

  declare code: string | null
  declare pinHash: string | null
  declare pinAttempts: number
  declare pinLockedUntil: DateTime | null
  declare pinResetTokenHash: string | null
  declare pinResetExpiresAt: DateTime | null
  declare loginAttempts: number
  declare loginLockedUntil: DateTime | null

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
