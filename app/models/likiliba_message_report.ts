import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LikilibaMessage from '#models/likiliba_message'

/** A member flagging a message for Reemite support. One per member and message. */
export default class LikilibaMessageReport extends BaseModel {
  static table = 'likiliba_message_reports'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: number

  @column()
  declare reporterMemberId: number

  @column()
  declare reason: string

  @column.dateTime()
  declare resolvedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => LikilibaMessage, { foreignKey: 'messageId' })
  declare message: BelongsTo<typeof LikilibaMessage>
}
