import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LikilibaMember from '#models/likiliba_member'

/**
 * A message a member wrote in the group's conversation. Never removed: deleting or hiding one
 * only stops it being shown, so the record of what was said stays available to support.
 */
export default class LikilibaMessage extends BaseModel {
  static table = 'likiliba_messages'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare memberId: number

  @column()
  declare body: string

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime()
  declare hiddenAt: DateTime | null

  @column()
  declare hiddenByInternalUserId: number | null

  @column()
  declare hideReason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => LikilibaMember, { foreignKey: 'memberId' })
  declare member: BelongsTo<typeof LikilibaMember>

  /** Shown to members: neither deleted by its author nor hidden by support. */
  get isVisible(): boolean {
    return !this.deletedAt && !this.hiddenAt
  }
}
