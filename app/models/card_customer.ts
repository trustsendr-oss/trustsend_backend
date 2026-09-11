import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CardCustomer extends BaseModel {
  static table = 'card_customers'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare businessId: number | null

  @column()
  declare provider: string

  @column()
  declare providerCustomerId: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
