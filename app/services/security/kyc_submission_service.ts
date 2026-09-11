import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import { KYC_DOCUMENT_TYPES, type KycDocumentType } from '#models/kyc_document'
import {
  ALLOWED_KYC_DOCUMENT_TYPES,
  MAX_KYC_DOCUMENT_SIZE_BYTES,
} from '#services/security/kyc_document_storage_service'
import {
  findSatisfiedCombination,
  describeRequirement,
  type KycVerificationType,
} from '#services/security/kyc_requirements'

export type KycSubmissionResult =
  | { ok: true; files: Array<{ type: KycDocumentType; buffer: Buffer; mimeType: string }> }
  | { ok: false; status: number; message: string }

/**
 * Reads every recognized KYC document field present on the request (one multipart field per
 * KycDocumentType — e.g. "id_card_front", "selfie"), validates each file's type/size, and
 * checks the resulting set against kyc_requirements.ts for the given verification_type.
 * Shared by both kyc_controller.ts (User) and business_dashboard/kyc_controller.ts (Business)
 * so the two subjects can't drift into different validation rules by accident.
 */
export async function collectAndValidateKycDocuments(
  request: HttpContext['request'],
  verificationType: KycVerificationType
): Promise<KycSubmissionResult> {
  const files: Array<{ type: KycDocumentType; buffer: Buffer; mimeType: string }> = []

  for (const documentType of KYC_DOCUMENT_TYPES) {
    const file = request.file(documentType, {
      size: MAX_KYC_DOCUMENT_SIZE_BYTES,
      extnames: [...ALLOWED_KYC_DOCUMENT_TYPES],
    })

    if (!file) continue

    if (!file.isValid) {
      return {
        ok: false,
        status: 422,
        message: `${documentType}: ${file.errors.map((e) => e.message).join(', ')}`,
      }
    }

    const buffer = await readFile(file.tmpPath!)
    // type/subtype come from the content-type header or the file's own magic number (see
    // MultipartFile#type/#subtype) — this is what makes the document servable with a correct
    // Content-Type later, instead of the hardcoded application/octet-stream it used to get.
    const mimeType =
      file.type && file.subtype ? `${file.type}/${file.subtype}` : 'application/octet-stream'
    files.push({ type: documentType, buffer, mimeType })
  }

  const presentTypes = files.map((f) => f.type)
  const satisfied = findSatisfiedCombination(verificationType, presentTypes)

  if (satisfied === null) {
    return {
      ok: false,
      status: 400,
      message: `Missing required document(s) for verification_type "${verificationType}". Accepted: ${describeRequirement(verificationType)}.`,
    }
  }

  return { ok: true, files }
}
