import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class BusinessSignupOtp extends BaseModel {
  static table = 'business_signup_otps'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare otpHash: string

  @column()
  declare attempts: number

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare consumedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
