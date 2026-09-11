import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import Business from '#models/business'

export default class BusinessApiKey extends BaseModel {
  static table = 'business_api_keys'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare businessId: number

  @column()
  declare keyPrefix: string

  @column()
  declare keyHash: string

  @column()
  declare status: 'active' | 'revoked'

  @column.dateTime()
  declare lastUsedAt: DateTime | null

  @column.dateTime()
  declare revokedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Business, { foreignKey: 'businessId' })
  declare business: BelongsTo<typeof Business>
}
