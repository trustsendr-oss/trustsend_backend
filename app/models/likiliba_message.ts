import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LikilibaMember from '#models/likiliba_member'

export type LikilibaMessageKind = 'text' | 'image' | 'file' | 'poll' | 'audio'

/**
 * A message a member wrote in the group's conversation: text, a photo or a file (with an
 * optional caption in `body`), a voice message, or a poll (its question in `body`). Never removed: deleting or hiding one
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
  declare kind: LikilibaMessageKind

  @column()
  declare body: string

  /** Image and file messages: the stored file, see LikilibaAttachmentStorageService. */
  @column()
  declare attachmentRef: string | null

  @column()
  declare attachmentMimeType: string | null

  /** The file name as the member sent it, for display only — never used as a path. */
  @column()
  declare attachmentName: string | null

  @column()
  declare attachmentSize: number | null

  /** Voice messages: their length, as the app recorded it. */
  @column()
  declare attachmentDurationMs: number | null

  /** The message of the same group this one answers, shown quoted above it. */
  @column()
  declare replyToId: number | null

  /** Polls: closed by their author, no more votes. */
  @column.dateTime()
  declare pollClosedAt: DateTime | null

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
