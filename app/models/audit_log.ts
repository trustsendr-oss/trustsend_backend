import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class AuditLog extends BaseModel {
  static table = 'audit_logs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare actorType: 'user' | 'agent' | 'internal_user' | 'system' | 'business'

  @column()
  declare actorId: number

  @column()
  declare action: string

  @column()
  declare resourceType: string

  @column()
  declare resourceId: string

  @column()
  declare before: Record<string, any> | null

  @column()
  declare after: Record<string, any> | null

  @column()
  declare ipAddress: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare deviceId: string | null

  @column()
  declare correlationId: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
