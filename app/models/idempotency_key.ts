import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class IdempotencyKey extends BaseModel {
  static table = 'idempotency_keys'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: string

  @column()
  declare actorType: 'user' | 'agent'

  @column()
  declare actorId: number

  @column()
  declare endpoint: string

  @column()
  declare requestHash: string

  @column()
  declare status: 'in_progress' | 'completed' | 'failed'

  @column()
  declare responseStatus: number | null

  @column()
  declare responseBody: Record<string, any> | null

  @column.dateTime()
  declare createdAt: DateTime

  @column.dateTime()
  declare expiresAt: DateTime
}
