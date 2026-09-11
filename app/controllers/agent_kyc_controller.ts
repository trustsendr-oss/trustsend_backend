import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import KycVerification from '#models/kyc_verification'
import KycDocument from '#models/kyc_document'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { KycDocumentStorageService } from '#services/security/kyc_document_storage_service'
import { collectAndValidateKycDocuments } from '#services/security/kyc_submission_service'

const submitAgentKycValidator = vine.create({
  verification_type: vine.enum(['identity', 'address', 'liveness', 'document', 'pep_screening']),
  provider: vine.string().optional(),
})

/**
 * Agent-side KYC submission — mirrors business_dashboard/kyc_controller.ts's Business flow,
 * scoped to the Agent record linked to the authenticated User. Admin review reuses the exact
 * same generic endpoints (POST /kyc/:kyc_id/approve|reject, GET /kyc/:kyc_id/documents(/:id)) —
 * those only look up by kyc_id and never branch on subject_type.
 *
 * Exists because agent_lifecycle_service.ts's approve() now requires an approved
 * subject_type='agent' KycVerification before activating an agent — previously there was no way
 * to ever create one (an agent could be activated with zero identity verification, unlike a
 * Business, which was already gated this way). Uses requireAgentForUser(), not
 * requireActiveAgentForUser(): the agent submitting this evidence is, by definition, not active
 * yet.
 */
export default class AgentKycController {
  /**
   * POST /api/v1/agents/kyc/submit
   */
  async submit({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    let agent
    try {
      agent = await AgentIdentityService.requireAgentForUser(user.id)
    } catch (error) {
      const err = error as any
      if (err.name === 'AgentNotFoundException') {
        return response.forbidden({ message: err.message })
      }
      throw error
    }

    const payload = await request.validateUsing(submitAgentKycValidator)

    const collected = await collectAndValidateKycDocuments(request, payload.verification_type)
    if (!collected.ok) {
      return response.status(collected.status).send({ message: collected.message })
    }

    const kyc = new KycVerification()
    kyc.subjectType = 'agent'
    kyc.subjectId = agent.id
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
   * GET /api/v1/agents/kyc/status
   */
  async getStatus({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthenticated' })
    }

    let agent
    try {
      agent = await AgentIdentityService.requireAgentForUser(user.id)
    } catch (error) {
      const err = error as any
      if (err.name === 'AgentNotFoundException') {
        return response.forbidden({ message: err.message })
      }
      throw error
    }

    const kyc = await KycVerification.query()
      .where('subject_type', 'agent')
      .where('subject_id', agent.id)
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
