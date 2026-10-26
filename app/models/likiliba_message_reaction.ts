import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One member's reaction to one message. */
export default class LikilibaMessageReaction extends BaseModel {
  static table = 'likiliba_message_reactions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: number

  @column()
  declare memberId: number

  @column()
  declare emoji: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
