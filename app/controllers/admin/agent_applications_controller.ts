import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import AgentApplication from '#models/agent_application'
import type InternalUser from '#models/internal_user'
import { AgentApplicationService } from '#services/agents/agent_application_service'

const approveValidator = vine.create({
  tier: vine.enum(['agent', 'super_agent', 'distributor', 'master']),
  email: vine.string().trim().email().optional(),
  parent_agent_id: vine.number().positive().optional(),
  commission_rate: vine.number().min(0).max(100).optional(),
  daily_limit: vine.string().regex(/^\d+$/).optional(),
  monthly_limit: vine.string().regex(/^\d+$/).optional(),
  per_transaction_limit: vine.string().regex(/^\d+$/).optional(),
})

const rejectValidator = vine.create({
  reason: vine.string().trim().minLength(10).maxLength(255),
})

const listValidator = vine.create({
  status: vine.enum(['submitted', 'under_review', 'approved', 'rejected']).optional(),
})

/**
 * Review queue for "become an agent" applications (internal users only). Approving creates the
 * agent record in pending_approval — see AgentApplicationService.approve().
 */
export default class AdminAgentApplicationsController {
  /** GET /api/v1/admin/agent-applications?status= */
  async index({ request, response }: HttpContext) {
    const { status } = await request.validateUsing(listValidator, { data: request.qs() })
    const query = AgentApplication.query().orderBy('created_at', 'desc')
    if (status) query.where('status', status)
    const applications = await query

    return response.ok({
      data: await Promise.all(
        applications.map((application) =>
          AgentApplicationService.serialize(application, { withApplicant: true })
        )
      ),
    })
  }

  /** GET /api/v1/admin/agent-applications/:id */
  async show({ params, response }: HttpContext) {
    const application = await AgentApplication.findOrFail(params.id)
    return response.ok({
      data: await AgentApplicationService.serialize(application, { withApplicant: true }),
    })
  }

  /** POST /api/v1/admin/agent-applications/:id/review */
  async review(ctx: HttpContext) {
    return this.run(ctx, async (reviewer) =>
      AgentApplicationService.markUnderReview(Number(ctx.params.id), reviewer.id, ctx.correlationId)
    )
  }

  /** POST /api/v1/admin/agent-applications/:id/approve */
  async approve(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(approveValidator)
    return this.run(ctx, async (reviewer) => {
      const { application } = await AgentApplicationService.approve(
        Number(ctx.params.id),
        reviewer.id,
        {
          tier: payload.tier,
          email: payload.email,
          parentAgentId: payload.parent_agent_id,
          commissionRate: payload.commission_rate,
          dailyLimit: payload.daily_limit ? BigInt(payload.daily_limit) : undefined,
          monthlyLimit: payload.monthly_limit ? BigInt(payload.monthly_limit) : undefined,
          perTransactionLimit: payload.per_transaction_limit
            ? BigInt(payload.per_transaction_limit)
            : undefined,
        },
        ctx.correlationId
      )
      return application
    })
  }

  /** POST /api/v1/admin/agent-applications/:id/reject */
  async reject(ctx: HttpContext) {
    const { reason } = await ctx.request.validateUsing(rejectValidator)
    return this.run(ctx, async (reviewer) =>
      AgentApplicationService.reject(Number(ctx.params.id), reviewer.id, reason, ctx.correlationId)
    )
  }

  private async run(
    { auth, response }: HttpContext,
    action: (reviewer: InternalUser) => Promise<AgentApplication>
  ) {
    const reviewer = auth.getUserOrFail() as InternalUser
    try {
      const application = await action(reviewer)
      return response.ok({
        data: await AgentApplicationService.serialize(application, { withApplicant: true }),
      })
    } catch (error) {
      const err = error as Error & { code?: string; status?: number }
      if (err.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'Application not found' })
      }
      if (err.name === 'AgentApplicationException') {
        return response.status(err.status ?? 422).send({ message: err.message, code: err.code })
      }
      // AgentOnboardingService signals tier/parent problems with a readable plain Error.
      return response.badRequest({ message: err.message || 'Action failed' })
    }
  }
}
