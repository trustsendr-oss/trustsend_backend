import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export const KYC_DOCUMENT_TYPES = [
  'id_card_front',
  'id_card_back',
  'passport',
  'driver_license_front',
  'driver_license_back',
  'selfie',
  'proof_of_address',
  'business_registration_certificate',
  'tax_identification_certificate',
  'representative_id_front',
  'representative_id_back',
  'other',
] as const

export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number]

/**
 * One specific piece of evidence attached to a kyc_verifications case — see
 * kyc_requirements.ts for which combinations of these satisfy which verification_type.
 */
export default class KycDocument extends BaseModel {
  static table = 'kyc_documents'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kycVerificationId: string

  @column()
  declare documentType: KycDocumentType

  @column({ serializeAs: null })
  declare rawPayloadRef: string

  /**
   * Real file format captured at upload time (e.g. "image/jpeg", "application/pdf") — without
   * this, KycController#getDocument had no way to tell the browser what it was sending and
   * always answered `application/octet-stream`, which is why viewers (including the admin
   * panel) could never render the file as an image or PDF preview, only download raw bytes.
   * Null on rows uploaded before this column existed; see sniffKycDocumentMimeType() for the
   * read-time fallback used for those.
   */
  @column()
  declare mimeType: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
