import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import User from '#models/user'
import BusinessStaff from '#models/business_staff'
import BorrowerGroupMember from '#models/borrower_group_member'
import Loan from '#models/loan'

export default class BorrowerGroup extends BaseModel {
  static table = 'borrower_groups'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare providerId: number

  @column()
  declare name: string

  @column()
  declare code: string

  @column()
  declare meetingFrequency: 'weekly' | 'biweekly' | 'monthly'

  @column()
  declare meetingDay: string | null

  @column()
  declare presidentUserId: number | null

  @column()
  declare secretaryUserId: number | null

  @column()
  declare treasurerUserId: number | null

  @column()
  declare loanOfficerId: number | null

  @column()
  declare status: 'active' | 'suspended' | 'closed'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Business, { foreignKey: 'providerId' })
  declare provider: BelongsTo<typeof Business>

  @belongsTo(() => User, { foreignKey: 'presidentUserId' })
  declare president: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'secretaryUserId' })
  declare secretary: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'treasurerUserId' })
  declare treasurer: BelongsTo<typeof User>

  @belongsTo(() => BusinessStaff, { foreignKey: 'loanOfficerId' })
  declare loanOfficer: BelongsTo<typeof BusinessStaff>

  @hasMany(() => BorrowerGroupMember, { foreignKey: 'groupId' })
  declare members: HasMany<typeof BorrowerGroupMember>

  @hasMany(() => Loan, { foreignKey: 'groupId' })
  declare loans: HasMany<typeof Loan>
}
