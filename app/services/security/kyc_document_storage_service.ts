import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CryptoService } from '#services/security/crypto_service'

const STORAGE_DIR = fileURLToPath(new URL('../../../storage/kyc_documents/', import.meta.url))

export const ALLOWED_KYC_DOCUMENT_TYPES = ['pdf', 'jpg', 'jpeg', 'png'] as const
export const MAX_KYC_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Stores KYC document scans (identity, address proof, business registration, etc.) encrypted
 * at rest — never behind a public URL. Files live outside public/, named by an opaque random id
 * (not derived from the kyc_verification id) so a leaked id alone doesn't let anyone guess or
 * enumerate document filenames.
 *
 * Interim measure, not a replacement for a real KYC/KYB provider (Smile Identity, Sumsub...):
 * we still don't verify the document's authenticity, just capture and protect it so an admin
 * actually has evidence to review instead of approving KYC on nothing at all.
 */
export class KycDocumentStorageService {
  /** Encrypts and persists a document, returning an opaque reference to store in kyc_verifications.raw_payload_ref. */
  static async store(fileBuffer: Buffer): Promise<string> {
    await mkdir(STORAGE_DIR, { recursive: true })

    const ref = randomUUID()
    const encrypted = CryptoService.encryptBuffer(fileBuffer)
    await writeFile(`${STORAGE_DIR}${ref}.enc`, encrypted)

    return ref
  }

  /** Decrypts and returns a previously stored document's bytes. */
  static async retrieve(ref: string): Promise<Buffer> {
    // ref always comes from our own randomUUID() output (validated by the caller against the
    // DB row it belongs to) — never taken raw from a request param, so no path traversal risk.
    const encrypted = await readFile(`${STORAGE_DIR}${ref}.enc`)
    return CryptoService.decryptBuffer(encrypted)
  }
}

/**
 * Identifies the real file format from its magic number. Only needed as a fallback for rows
 * uploaded before kyc_documents.mime_type existed (see the migration adding that column) — every
 * new upload captures the real content-type at submission time instead of guessing at read time.
 * Only recognizes the formats KycDocumentStorageService ever accepts (see
 * ALLOWED_KYC_DOCUMENT_TYPES above).
 */
export function sniffKycDocumentMimeType(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return 'application/pdf'
  }
  return 'application/octet-stream'
}
