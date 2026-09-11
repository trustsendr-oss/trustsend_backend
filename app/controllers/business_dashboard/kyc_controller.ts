import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import KycVerification from '#models/kyc_verification'
import KycDocument from '#models/kyc_document'
import { KycDocumentStorageService } from '#services/security/kyc_document_storage_service'
import { collectAndValidateKycDocuments } from '#services/security/kyc_submission_service'

const submitBusinessKycValidator = vine.create({
  verification_type: vine.enum(['identity', 'address', 'liveness', 'document', 'pep_screening']),
  provider: vine.string().optional(),
})

/**
 * Business-side KYC (KYB) submission — mirrors kyc_controller.ts's User flow, scoped to
 * ctx.business. Admin review reuses the exact same generic endpoints
 * (POST /kyc/:kyc_id/approve|reject, GET /kyc/:kyc_id/documents(/:document_id)) unchanged —
 * those only look up by kyc_id and never branch on subject_type, so nothing there needed to
 * change to support businesses.
 */
export default class BusinessKycController {
  /**
   * POST /api/v1/business/dashboard/kyc/submit
   * Requires the specific document(s) that verification_type actually needs (see
   * kyc_requirements.ts), not one anonymous "document" field — e.g. verification_type
   * "identity" needs a representative's ID (front+back, or passport); "document" needs the
   * business registration certificate. Multipart fields are named after the document.
   */
  async submit({ business, request, response }: HttpContext) {
    const payload = await request.validateUsing(submitBusinessKycValidator)

    const collected = await collectAndValidateKycDocuments(request, payload.verification_type)
    if (!collected.ok) {
      return response.status(collected.status).send({ message: collected.message })
    }

    const kyc = new KycVerification()
    kyc.subjectType = 'business'
    kyc.subjectId = business.id
    kyc.verificationType = payload.verification_type
    kyc.provider = payload.provider || null
    kyc.status = 'pending'
    kyc.submittedAt = DateTime.now()

    await kyc.save()

    for (const file of collected.files) {
      const rawPayloadRef = await KycDocumentStorageService.store(file.buffer)
      const doc = new KycDocument()
      doc.kycVerificationId = kyc.id
      doc.documentType = file.type
      doc.rawPayloadRef = rawPayloadRef
      doc.mimeType = file.mimeType
      await doc.save()
    }

    return response.created({
      data: {
        kyc_id: kyc.id,
        status: kyc.status,
        verification_type: kyc.verificationType,
        documents: collected.files.map((f) => f.type),
        submitted_at: kyc.submittedAt,
      },
    })
  }

  /**
   * GET /api/v1/business/dashboard/kyc/status
   */
  async getStatus({ business, response }: HttpContext) {
    const kyc = await KycVerification.query()
      .where('subject_type', 'business')
      .where('subject_id', business.id)
      .orderBy('created_at', 'desc')
      .first()

    if (!kyc) {
      return response.ok({
        data: {
          status: 'not_started',
          message: 'No KYC verification found',
        },
      })
    }

    const documents = await KycDocument.query().where('kyc_verification_id', kyc.id)

    return response.ok({
      data: {
        kyc_id: kyc.id,
        status: kyc.status,
        verification_type: kyc.verificationType,
        provider: kyc.provider,
        documents: documents.map((d) => d.documentType),
        submitted_at: kyc.submittedAt,
        decided_at: kyc.decidedAt,
        decision_reason: kyc.decisionReason,
        created_at: kyc.createdAt,
      },
    })
  }
}
