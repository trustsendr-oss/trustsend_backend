import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/orm'
import KycDocument from '#models/kyc_document'
import { Realtime } from '#services/realtime/realtime'

/** Rows whose status changed in the save under way (see the hooks below). */
const statusChanged = new WeakSet<object>()

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

  /** Business KYC (KYB) only — null for user/agent verifications. */
  @column()
  declare businessName: string | null

  @column()
  declare businessType: 'company' | 'startup' | null

  @column()
  declare verificationType: 'identity' | 'address' | 'liveness' | 'document' | 'pep_screening'

  @column()
  declare status: 'not_started' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired'

  @column()
  declare decisionReason: string | null

  /**
   * Country of residence (ISO 3166-1 alpha-2), given by the holder with their identity documents
   * and checked by the reviewer. International transfers read the sender's country from here.
   */
  @column()
  declare countryCode: string | null

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

  /*
   * Realtime: the owner hears about a status change once it commits, whichever code path made it
   * (agent, support, scheduled job, provider callback). See app/services/realtime/realtime.ts.
   */
  @beforeSave()
  static noteStatusChange(row: KycVerification) {
    if (row.$isNew || 'status' in row.$dirty) statusChanged.add(row)
  }

  @afterSave()
  static announceStatusChange(row: KycVerification) {
    if (!statusChanged.delete(row)) return
    Realtime.toUserForRow(row, row.subjectType === 'user' ? row.subjectId : null, {
      type: 'kyc.updated',
      status: row.status,
    })
  }
}
