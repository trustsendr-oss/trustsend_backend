import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * kyc_documents never recorded the uploaded file's real format — KycController#getDocument had
 * nothing to answer with but a hardcoded `application/octet-stream`, so no viewer (including the
 * admin panel) could ever render a document inline as an image or PDF; every open was a raw
 * download. This column lets kyc_submission_service.ts capture the real content-type once, at
 * upload time, from the multipart file's own type/subtype (see MultipartFile#type/#subtype).
 *
 * Nullable: rows uploaded before this column existed have no captured format. Rather than
 * decrypting every stored document here to backfill it (this schema migration has no business
 * touching KycDocumentStorageService/CryptoService), KycController#getDocument falls back to
 * sniffKycDocumentMimeType() (magic-number detection) for exactly those rows, at read time.
 */
export default class extends BaseSchema {
  protected tableName = 'kyc_documents'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('mime_type')
        .nullable()
        .comment(
          'Real content-type captured at upload (e.g. image/jpeg, application/pdf); null for pre-existing rows'
        )
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('mime_type')
    })
  }
}
