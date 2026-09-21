import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { type DateTime } from 'luxon'

export default class User extends compose(
  UserSchema,
  withAuthFinder(() => hash.use())
) {
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

  /**
   * Fails closed when the account has no password, instead of letting the auth mixin throw.
   *
   * A holder enrolled at a counter has `password` null on purpose — they operate by code and PIN,
   * never by password. The mixin's own verifyPassword raises a RuntimeException for a null column,
   * which would surface as a 500 on the login route and, by differing from the generic failure
   * every other bad login returns, confirm to the caller that the account exists.
   *
   * The discarded hash keeps the timing in line with a real verification, the same way the mixin
   * burns a hash for an unknown identifier.
   */
  async verifyPassword(plainPassword: string): Promise<boolean> {
    if (!this.password) {
      await hash.use().make(plainPassword)
      return false
    }
    return super.verifyPassword(plainPassword)
  }

  get initials() {
    // A counter-enrolled holder has no e-mail, so the name taken down at enrolment is the only
    // source left; `code` is the last resort so this always returns something displayable.
    const parts = this.fullName ? this.fullName.split(' ') : this.email ? this.email.split('@') : []
    const [first, last] = parts

    if (!first) {
      return this.code ? this.code.slice(0, 2) : ''
    }
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
