import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class FeeSchedule extends BaseModel {
  static table = 'fee_schedules'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare operationType: string

  @column()
  declare feePercent: number

  @column()
  declare updatedBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
