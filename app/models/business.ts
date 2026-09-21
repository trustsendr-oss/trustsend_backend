import { DateTime } from 'luxon'
import { column, hasMany, belongsTo, BaseModel } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/orm'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import Wallet from '#models/wallet'
import BusinessApiKey from '#models/business_api_key'
import InternalUser from '#models/internal_user'
import Plan from '#models/plan'
import Agent from '#models/agent'
import BusinessStaff from '#models/business_staff'

/**
 * Business — a third-party institution account. A merchant by default; `kind` also covers the
 * partner institutions that sell through TumaPlus, such as an IMF. Two independent access paths
 * share this same row:
 * server-to-server via BusinessApiKey (see business_api_key_middleware.ts), and a human
 * dashboard login via this model's own access tokens (businessDashboard guard, config/auth.ts).
 * Its own token table (business_access_tokens) — never the shared auth_access_tokens table,
 * which has a hard FK to users(id).
 */
export default class Business extends compose(
  BaseModel,
  withAuthFinder(() => hash.use())
) {
  static table = 'businesses'

  static accessTokens = DbAccessTokensProvider.forModel(Business, {
    table: 'business_access_tokens',
  })
  declare currentAccessToken?: AccessToken

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare name: string

  /**
   * What this institution IS — never what it may sell, which stays with the plan's feature map
   * (see Plan.hasFeature and business_plan_middleware.ts). An IMF is a business whose plan grants
   * `lending.credit`/`savings.accounts`; this column only labels the row.
   */
  @column()
  declare kind: 'merchant' | 'imf' | 'bank' | 'insurer'

  @column()
  declare email: string

  @column()
  declare phone: string

  @column({ serializeAs: null })
  declare password: string | null

  @column()
  declare loginAttempts: number

  @column.dateTime()
  declare loginLockedUntil: DateTime | null

  @column({ serializeAs: null })
  declare pinHash: string | null

  @column()
  declare pinAttempts: number

  @column.dateTime()
  declare pinLockedUntil: DateTime | null

  @column({ serializeAs: null })
  declare pinResetTokenHash: string | null

  @column.dateTime()
  declare pinResetExpiresAt: DateTime | null

  @column()
  declare status: 'pending_approval' | 'active' | 'suspended' | 'terminated'

  @column()
  declare walletId: number | null

  @column()
  declare webhookUrl: string | null

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column()
  declare approvedBy: number | null

  @column.dateTime()
  declare suspendedAt: DateTime | null

  @column()
  declare suspensionReason: string | null

  @column.dateTime()
  declare terminatedAt: DateTime | null

  @column()
  declare terminationReason: string | null

  @column()
  declare planId: number | null

  @column.dateTime()
  declare planSubscribedAt: DateTime | null

  @column.dateTime()
  declare planNextMaintenanceBillingAt: DateTime | null

  @column()
  declare planPaymentStatus: 'current' | 'past_due'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Wallet, { foreignKey: 'walletId' })
  declare wallet: BelongsTo<typeof Wallet>

  @belongsTo(() => InternalUser, { foreignKey: 'approvedBy' })
  declare approver: BelongsTo<typeof InternalUser>

  @belongsTo(() => Plan, { foreignKey: 'planId' })
  declare plan: BelongsTo<typeof Plan>

  @hasMany(() => BusinessApiKey, { foreignKey: 'businessId' })
  declare apiKeys: HasMany<typeof BusinessApiKey>

  /**
   * The agents this institution owns — its counters, for an IMF. Empty for a merchant, and never
   * the TumaPlus network's own agents, which carry a null business_id.
   */
  @hasMany(() => Agent, { foreignKey: 'businessId' })
  declare branches: HasMany<typeof Agent>

  /** The people who work here — tellers, credit officers, branch managers. */
  @hasMany(() => BusinessStaff, { foreignKey: 'businessId' })
  declare staff: HasMany<typeof BusinessStaff>
}
