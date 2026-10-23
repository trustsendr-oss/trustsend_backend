import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * The group's own history, readable by its members. Append-only, like audit_logs, which records
 * the same actions for compliance.
 */
export default class LikilibaEvent extends BaseModel {
  static table = 'likiliba_events'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare memberId: number | null

  @column()
  declare actorType: 'user' | 'system' | 'internal_user'

  @column()
  declare actorId: number

  @column()
  declare eventType: string

  @column()
  declare payload: Record<string, any> | null

  @column()
  declare correlationId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
