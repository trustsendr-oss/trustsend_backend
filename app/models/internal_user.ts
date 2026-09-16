import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

/**
 * InternalUser — Staff member (support, compliance, finance, admin)
 * Uses the same access token system as regular users
 */
export default class InternalUser extends compose(
  BaseModel,
  withAuthFinder(() => hash.use())
) {
  static table = 'internal_users'

  // Dedicated table — the default (auth_access_tokens) has a hard FK to users(id), which is
  // wrong for this model and previously made every internal_user login either fail or (worse)
  // silently attach the token to an unrelated users row sharing the same id.
  static accessTokens = DbAccessTokensProvider.forModel(InternalUser, {
    table: 'internal_access_tokens',
  })
  declare currentAccessToken?: AccessToken

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column()
  declare fullName: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare status: 'active' | 'inactive' | 'suspended'

  @column()
  declare mustChangePassword: boolean

  @column()
  declare mfaEnabled: boolean

  @column({ serializeAs: null })
  declare mfaSecretEncrypted: string | null

  /** Last accepted TOTP time step — a code for this step or earlier is refused (anti-replay). */
  @column({ serializeAs: null })
  declare mfaLastUsedStep: number | null

  @column()
  declare loginAttempts: number

  @column.dateTime()
  declare loginLockedUntil: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
