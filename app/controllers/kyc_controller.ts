import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import KycVerification from '#models/kyc_verification'
import KycDocument from '#models/kyc_document'
import type InternalUser from '#models/internal_user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import {
  KycDocumentStorageService,
  sniffKycDocumentMimeType,
} from '#services/security/kyc_document_storage_service'
import { collectAndValidateKycDocuments } from '#services/security/kyc_submission_service'
import vine from '@vinejs/vine'

const initiateKycValidator = vine.create({
  verification_type: vine.enum(['identity', 'address', 'liveness', 'document', 'pep_screening']),
  provider: vine.string().optional(),
})

const VALID_KYC_STATUSES = [
  'not_started',
  'pending',
  'in_review',
  'approved',
  'rejected',
  'expired',
]
const VALID_SUBJECT_TYPES = ['user', 'agent', 'business']

const KYC_DOCUMENT_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

export default class KycController {
  /**
   * GET /api/v1/kyc?status=pending&subject_type=business (admin only)
   * Discovery — without this, approve()/reject()/listDocuments() below only ever work on a
   * kyc_id an admin already knows; there was no way to find out which cases even exist to
   * review. No pagination (mirrors /agents and /businesses — same trust/scale assumption);
   * optional `status`/`subject_type` query filters narrow it down, e.g. the common "what's
   * waiting on me" view is `?status=pending`.
   */
  async index({ auth, request, response }: HttpContext) {
    await auth.authenticateUsing(['internal'])

    const status = request.input('status') as string | undefined
    if (status && !VALID_KYC_STATUSES.includes(status)) {
      return response.badRequest({ message: `Invalid status filter: ${status}` })
    }

    const subjectType = request.input('subject_type') as string | undefined
    if (subjectType && !VALID_SUBJECT_TYPES.includes(subjectType)) {
      return response.badRequest({ message: `Invalid subject_type filter: ${subjectType}` })
    }

    const query = KycVerification.query().orderBy('created_at', 'desc')
    if (status) query.where('status', status)
    if (subjectType) query.where('subject_type', subjectType)

    const verifications = await query

    return response.ok({
      data: verifications.map((k) => ({
        id: k.id,
        subject_type: k.subjectType,
        subject_id: k.subjectId,
        verification_type: k.verificationType,
        provider: k.provider,
        status: k.status,
        submitted_at: k.submittedAt,
        decided_at: k.decidedAt,
        decision_reason: k.decisionReason,
        reviewed_by: k.reviewedBy,
        created_at: k.createdAt,
      })),
    })
  }

  /**
   * GET /api/v1/kyc/:kyc_id (admin only)
   * Single-record detail — index() above never returned enough for a dedicated review screen
   * (no decided_at/decision_reason drill-down was needed there), and there was previously no way
   * to fetch one case by id at all outside the list.
   */
  async show({ auth, params, response }: HttpContext) {
    await auth.authenticateUsing(['internal'])
    const kyc = await KycVerification.findOrFail(params.kyc_id)

    return response.ok({
      data: {
        id: kyc.id,
        subject_type: kyc.subjectType,
        subject_id: kyc.subjectId,
        verification_type: kyc.verificationType,
        provider: kyc.provider,
        status: kyc.status,
        submitted_at: kyc.submittedAt,
        decided_at: kyc.decidedAt,
        decision_reason: kyc.decisionReason,
        reviewed_by: kyc.reviewedBy,
        created_at: kyc.createdAt,
      },
    })
  }

  /**
   * POST /api/v1/kyc/submit
   * Initiate KYC verification — requires the specific document(s) that verification_type
   * actually needs (see kyc_requirements.ts), not one anonymous "document" field. Multipart
   * fields are named after the document, e.g. id_card_front, id_card_back, selfie,
   * proof_of_address. Without real evidence attached, an admin has nothing to review and
   * "approval" is a rubber stamp.
   */
  async submit({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const payload = await request.validateUsing(initiateKycValidator)

    const collected = await collectAndValidateKycDocuments(request, payload.verification_type)
    if (!collected.ok) {
      return response.status(collected.status).send({ message: collected.message })
    }

    try {
      const kyc = new KycVerification()
      kyc.subjectType = 'user'
      kyc.subjectId = user.id
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
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'KYC submission failed' })
    }
  }

  /**
   * GET /api/v1/kyc/:kyc_id/documents
   * Admin-only. Lists the documents attached to a case (types + ids), without their content.
   */
  async listDocuments({ auth, params, response }: HttpContext) {
    await auth.authenticateUsing(['internal'])
    const kyc = await KycVerification.findOrFail(params.kyc_id)
    const documents = await KycDocument.query().where('kyc_verification_id', kyc.id)

    return response.ok({
      data: documents.map((d) => ({
        id: d.id,
        document_type: d.documentType,
        created_at: d.createdAt,
      })),
    })
  }

  /**
   * GET /api/v1/kyc/:kyc_id/documents/:document_id
   * Admin-only. Decrypts and streams back one specific document — never a public URL, and
   * every access is audited (this is PII).
   */
  async getDocument({ auth, params, correlationId, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const kyc = await KycVerification.findOrFail(params.kyc_id)
    const document = await KycDocument.query()
      .where('id', params.document_id)
      .where('kyc_verification_id', kyc.id)
      .firstOrFail()

    const buffer = await KycDocumentStorageService.retrieve(document.rawPayloadRef)
    // Rows uploaded before kyc_documents.mime_type existed have nothing captured — recover the
    // format here instead of forever answering application/octet-stream for them.
    const mimeType = document.mimeType || sniffKycDocumentMimeType(buffer)
    const extension = KYC_DOCUMENT_EXTENSION_BY_MIME_TYPE[mimeType]

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: user.id,
      action: 'kyc.document_viewed',
      resourceType: 'kyc_verification',
      resourceId: kyc.id,
      before: undefined,
      after: { document_id: document.id, document_type: document.documentType },
      correlationId,
    })

    response.header('Content-Type', mimeType)
    response.header(
      'Content-Disposition',
      `inline; filename="kyc-${kyc.id}-${document.documentType}${extension ? `.${extension}` : ''}"`
    )
    return response.send(buffer)
  }

  /**
   * GET /api/v1/kyc/status
   * Get current KYC status for authenticated user
   */
  async getStatus({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    const kyc = await KycVerification.query()
      .where('subject_type', 'user')
      .where('subject_id', user.id)
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

  /**
   * POST /api/v1/kyc/:kyc_id/approve
   * Approve KYC (admin only)
   */
  async approve({ auth, params, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    const kyc = await KycVerification.findOrFail(params.kyc_id)

    if (kyc.status !== 'pending') {
      return response.badRequest({
        message: `Cannot approve KYC with status: ${kyc.status}`,
      })
    }

    try {
      const beforeData = { status: kyc.status }

      kyc.status = 'approved'
      kyc.decidedAt = DateTime.now()
      kyc.reviewedBy = user.id
      await kyc.save()

      // ✅ Add audit logging
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: user.id,
        action: 'kyc.approved',
        resourceType: 'kyc_verification',
        resourceId: kyc.id,
        before: beforeData,
        after: { status: 'approved', reviewed_by: user.id },
        correlationId: (params as any).correlationId || 'unknown',
      })

      await InAppNotificationService.notify({
        recipientType: kyc.subjectType,
        recipientId: kyc.subjectId,
        type: 'kyc.approved',
        title: 'KYC approved',
        message: `Your ${kyc.verificationType} verification has been approved.`,
        data: { kyc_id: kyc.id },
      })

      return response.ok({
        data: {
          kyc_id: kyc.id,
          status: kyc.status,
          decided_at: kyc.decidedAt,
          approved_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Approval failed' })
    }
  }

  /**
   * POST /api/v1/kyc/:kyc_id/reject
   * Reject KYC (admin only)
   */
  async reject({ auth, params, request, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    const kyc = await KycVerification.findOrFail(params.kyc_id)

    const rejectValidator = vine.create({
      reason: vine.string().minLength(10).maxLength(500),
    })
    const { reason } = await request.validateUsing(rejectValidator)

    if (kyc.status !== 'pending') {
      return response.badRequest({
        message: `Cannot reject KYC with status: ${kyc.status}`,
      })
    }

    try {
      const beforeData = { status: kyc.status }

      kyc.status = 'rejected'
      kyc.decidedAt = DateTime.now()
      kyc.decisionReason = reason
      kyc.reviewedBy = user.id
      await kyc.save()

      // ✅ Add audit logging
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: user.id,
        action: 'kyc.rejected',
        resourceType: 'kyc_verification',
        resourceId: kyc.id,
        before: beforeData,
        after: { status: 'rejected', reason, reviewed_by: user.id },
        correlationId: (params as any).correlationId || 'unknown',
      })

      await InAppNotificationService.notify({
        recipientType: kyc.subjectType,
        recipientId: kyc.subjectId,
        type: 'kyc.rejected',
        title: 'KYC rejected',
        message: `Your ${kyc.verificationType} verification was rejected: ${reason}`,
        data: { kyc_id: kyc.id, reason },
      })

      return response.ok({
        data: {
          kyc_id: kyc.id,
          status: kyc.status,
          decision_reason: kyc.decisionReason,
          rejected_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.internalServerError({ message: err.message || 'Rejection failed' })
    }
  }
}
