import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Likiliba from '#models/likiliba'
import User from '#models/user'

export type LikilibaInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'admitted' | 'rejected' | 'revoked' | 'expired'

/**
 * An invitation to one group. A person may hold invitations to several groups at once; within one
 * group, only one is live at a time (partial unique indexes).
 */
export default class LikilibaInvitation extends BaseModel {
  static table = 'likiliba_invitations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare invitedByUserId: number

  @column()
  declare channel: 'account' | 'phone' | 'link'

  /** Known once the person is identified: at once for an account, on acceptance for a link. */
  @column()
  declare inviteeUserId: number | null

  @column()
  declare inviteePhone: string | null

  /** SHA-256 of a link invitation's token; the token itself is shown once, to the organiser. */
  @column({ serializeAs: null })
  declare tokenHash: string | null

  @column()
  declare status: LikilibaInvitationStatus

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare respondedAt: DateTime | null

  @column.dateTime()
  declare decidedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Likiliba, { foreignKey: 'likilibaId' })
  declare likiliba: BelongsTo<typeof Likiliba>

  @belongsTo(() => User, { foreignKey: 'inviteeUserId' })
  declare invitee: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'invitedByUserId' })
  declare invitedBy: BelongsTo<typeof User>

  get isExpired(): boolean {
    return this.expiresAt <= DateTime.now()
  }
}
