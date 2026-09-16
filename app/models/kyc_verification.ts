import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/orm'
import KycDocument from '#models/kyc_document'

export default class KycVerification extends BaseModel {
  static table = 'kyc_verifications'

  @column({ isPrimary: true })
  declare id: string // Alphanumérique: KYC-XXXXXXXX

  @column()
  declare subjectType: 'user' | 'agent' | 'business'

  @column()
  declare subjectId: number

  @column()
  declare provider: string | null

  @column()
  declare providerReference: string | null

  @column()
  declare verificationType: 'identity' | 'address' | 'liveness' | 'document' | 'pep_screening'

  @column()
  declare status: 'not_started' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired'

  @column()
  declare decisionReason: string | null

  @column()
  declare reviewedBy: number | null

  @column.dateTime()
  declare submittedAt: DateTime | null

  @column.dateTime()
  declare decidedAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => KycDocument, { foreignKey: 'kycVerificationId' })
  declare documents: HasMany<typeof KycDocument>
}
