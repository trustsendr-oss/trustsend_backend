import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/orm'
import KycVerification from '#models/kyc_verification'

export default class KycStatusHistory extends BaseModel {
  static table = 'kyc_status_history'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kycVerificationId: number

  @column()
  declare previousStatus: string

  @column()
  declare newStatus: string

  @column()
  declare changedBy: 'system' | 'provider' | 'internal_user'

  @column()
  declare reason: string | null

  @column.dateTime()
  declare createdAt: DateTime

  @belongsTo(() => KycVerification, { foreignKey: 'kycVerificationId' })
  declare kyc: BelongsTo<typeof KycVerification>
}
