import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import type User from '#models/user'
import { AgentApplicationService } from '#services/agents/agent_application_service'
import { AgentEligibilityService } from '#services/agents/agent_eligibility_service'

const submitValidator = vine.create({
  business_name: vine.string().trim().minLength(2).maxLength(120),
  phone: vine.string().trim().minLength(8).maxLength(20),
  city: vine.string().trim().minLength(2).maxLength(80),
  region: vine.string().trim().maxLength(80).optional(),
  address: vine.string().trim().maxLength(255).optional(),
  motivation: vine.string().trim().maxLength(1000).optional(),
  sponsor_code: vine
    .string()
    .regex(/^\d{9}$/)
    .optional(),
})

/**
 * "Become an agent", applicant side. The applicant is always the signed-in user; review happens
 * in admin/agent_applications_controller.ts.
 */
export default class AgentApplicationsController {
  /** GET /api/v1/agent-applications/mine — latest application, or `data: null`. */
  async mine({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const application = await AgentApplicationService.latestFor(user.id)
    return response.ok({
      data: application ? await AgentApplicationService.serialize(application) : null,
    })
  }

  /**
   * GET /api/v1/agent-applications/eligibility — whether the signed-in customer meets the
   * balance condition (100 USD, or the CDF equivalent), so the app can say so before the form.
   */
  async eligibility({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    return response.ok({ data: await AgentEligibilityService.evaluate(user.id) })
  }

  /** POST /api/v1/agent-applications */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const payload = await request.validateUsing(submitValidator)

    try {
      const application = await AgentApplicationService.submit(
        user,
        {
          businessName: payload.business_name,
          phone: payload.phone,
          city: payload.city,
          region: payload.region,
          address: payload.address,
          motivation: payload.motivation,
          sponsorCode: payload.sponsor_code,
        },
        correlationId
      )
      return response.created({ data: await AgentApplicationService.serialize(application) })
    } catch (error) {
      const err = error as Error & { code?: string; status?: number }
      if (err.name === 'AgentApplicationException') {
        return response.status(err.status ?? 422).send({ message: err.message, code: err.code })
      }
      throw error
    }
  }
}
