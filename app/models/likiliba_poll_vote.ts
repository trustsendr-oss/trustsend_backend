import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One member's vote on a poll: a single choice, replaced when they pick another. */
export default class LikilibaPollVote extends BaseModel {
  static table = 'likiliba_poll_votes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: number

  @column()
  declare optionId: number

  @column()
  declare memberId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
