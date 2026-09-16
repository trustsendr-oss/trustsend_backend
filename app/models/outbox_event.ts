import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OutboxEvent extends BaseModel {
  static table = 'outbox_events'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare aggregateType: string

  @column()
  declare aggregateId: string // Alphanumérique: TXN-XXXXXXXX, DSP-XXXXXXXX, etc.

  @column()
  declare eventType: string

  @column()
  declare payload: Record<string, any>

  @column()
  declare status: 'pending' | 'processing' | 'published' | 'failed'

  @column()
  declare attempts: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare publishedAt: DateTime | null
}
