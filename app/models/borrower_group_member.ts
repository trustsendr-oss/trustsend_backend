import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BorrowerGroup from '#models/borrower_group'
import User from '#models/user'

export default class BorrowerGroupMember extends BaseModel {
  static table = 'borrower_group_members'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare groupId: number

  @column()
  declare userId: number

  @column()
  declare role: 'leader' | 'officer' | 'member'

  @column.dateTime()
  declare joinedAt: DateTime

  @column()
  declare status: 'active' | 'left' | 'defaulted'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => BorrowerGroup, { foreignKey: 'groupId' })
  declare group: BelongsTo<typeof BorrowerGroup>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>
}
