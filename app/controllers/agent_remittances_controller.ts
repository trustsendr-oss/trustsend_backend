import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import type Agent from '#models/agent'
import { remittanceErrorResponse } from '#controllers/remittances_controller'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { RemittancePresenter } from '#services/remittances/remittance_presenter'
import { RemittanceService } from '#services/remittances/remittance_service'

const lookupValidator = vine.create({
  code: vine.string().trim().minLength(10).maxLength(16),
})

const payValidator = vine.create({
  code: vine.string().trim().minLength(10).maxLength(16),
  beneficiary_phone: vine.string().trim().minLength(9).maxLength(20),
  id_type: vine.enum(['national_id', 'voter_card', 'passport', 'driver_license']),
  id_number: vine.string().trim().minLength(4).maxLength(40),
})

/**
 * Paying out an international transfer at the counter. Active agents only; the agent is always
 * the signed-in user's own record.
 */
export default class AgentRemittancesController {
  /** POST /api/v1/agent/remittances/lookup — what a pickup code corresponds to. */
  async lookup(ctx: HttpContext) {
    const agent = await this.agent(ctx)
    if (!agent) return
    const { code } = await ctx.request.validateUsing(lookupValidator)
    try {
      const remittance = await RemittanceService.lookupForAgent(agent, code, ctx.correlationId)
      return ctx.response.ok({ data: RemittancePresenter.forAgent(remittance) })
    } catch (error) {
      return remittanceErrorResponse(error, ctx.response)
    }
  }

  /** POST /api/v1/agent/remittances/:id/pay — code + beneficiary phone + ID document. */
  async pay(ctx: HttpContext) {
    const agent = await this.agent(ctx)
    if (!agent) return
    const payload = await ctx.request.validateUsing(payValidator)
    try {
      const remittance = await RemittanceService.payOut(agent, {
        remittanceId: ctx.params.id,
        code: payload.code,
        beneficiaryPhone: payload.beneficiary_phone,
        idType: payload.id_type,
        idNumber: payload.id_number,
        correlationId: ctx.correlationId,
      })
      return ctx.response.ok({ data: RemittancePresenter.forAgent(remittance) })
    } catch (error) {
      return remittanceErrorResponse(error, ctx.response)
    }
  }

  private async agent({ auth, response }: HttpContext): Promise<Agent | null> {
    const user = auth.getUserOrFail()
    try {
      return await AgentIdentityService.requireActiveAgentForUser(user.id)
    } catch (error) {
      const err = error as Error
      if (err.name === 'AgentNotFoundException') {
        response.notFound({ message: err.message, code: 'NOT_AN_AGENT' })
        return null
      }
      if (err.name === 'AgentNotActiveException') {
        response.forbidden({ message: err.message, code: 'AGENT_NOT_ACTIVE' })
        return null
      }
      throw error
    }
  }
}
