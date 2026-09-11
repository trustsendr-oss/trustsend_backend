import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Notification extends BaseModel {
  static table = 'notifications'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare recipientType: 'user' | 'agent' | 'business'

  @column()
  declare recipientId: number

  @column()
  declare type: string

  @column()
  declare title: string

  @column()
  declare message: string

  @column()
  declare data: Record<string, any> | null

  @column.dateTime()
  declare readAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
