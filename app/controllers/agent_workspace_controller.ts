import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import type Agent from '#models/agent'
import { AgentIdentityService } from '#services/agents/agent_identity_service'
import { AgentWorkspaceService } from '#services/agents/agent_workspace_service'

const operationsValidator = vine.create({
  scope: vine.enum(['pending', 'recent']).optional(),
})

/**
 * The signed-in agent's own workspace, used by the same mobile app customers use.
 *
 * Every route resolves the agent from the authenticated user (AgentIdentityService) — nothing
 * here takes an agent id from the request. A customer account gets 404 on /agent/me, which is how
 * the app knows not to show the agent space at all; "not found" rather than "forbidden" because
 * being an agent is a property of the account, not a permission the caller lacks.
 */
export default class AgentWorkspaceController {
  /** GET /api/v1/agent/me — profile, float, KYC state and server-computed capabilities. */
  async me(ctx: HttpContext) {
    const agent = await this.resolve(ctx)
    if (!agent) return

    return ctx.response.ok({ data: await AgentWorkspaceService.profile(agent) })
  }

  /** GET /api/v1/agent/operations?scope=pending|recent — cash-ins and cash-outs at this agent. */
  async operations(ctx: HttpContext) {
    const agent = await this.resolve(ctx)
    if (!agent) return

    const { scope } = await ctx.request.validateUsing(operationsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok({
      data: await AgentWorkspaceService.operations(agent, scope ?? 'recent'),
    })
  }

  /**
   * GET /api/v1/agent/operations/:transaction_id — one deposit or withdrawal from this agent's
   * history, in full. Open to a suspended agent too, like the history itself.
   */
  async operation(ctx: HttpContext) {
    const agent = await this.resolve(ctx)
    if (!agent) return

    const operation = await AgentWorkspaceService.operationFor(agent, ctx.params.transaction_id)
    if (!operation) {
      return ctx.response.notFound({
        message: 'No operation with this reference was taken at your counter',
        code: 'OPERATION_NOT_FOUND',
      })
    }
    return ctx.response.ok({ data: operation })
  }

  /**
   * GET /api/v1/agent/cash-outs/:transaction_id — what the agent is about to pay out, read from
   * the customer's QR code. Active agents only: a suspended one cannot pay out anyway.
   */
  async cashOut(ctx: HttpContext) {
    const agent = await this.resolve(ctx, { activeOnly: true })
    if (!agent) return

    const operation = await AgentWorkspaceService.cashOutFor(agent, ctx.params.transaction_id)
    if (!operation) {
      return ctx.response.notFound({
        message: 'No withdrawal with this reference was requested at your counter',
        code: 'CASH_OUT_NOT_FOUND',
      })
    }
    return ctx.response.ok({ data: operation })
  }

  /** GET /api/v1/agent/sub-agents — the direct children float can be pushed to. */
  async subAgents(ctx: HttpContext) {
    const agent = await this.resolve(ctx, { activeOnly: true })
    if (!agent) return

    return ctx.response.ok({ data: await AgentWorkspaceService.subAgents(agent) })
  }

  /**
   * The caller's agent record, or an error response already sent. `activeOnly` rejects a
   * pending, suspended or terminated agent with 403 — they still reach /me and their history.
   */
  private async resolve(
    { auth, response }: HttpContext,
    { activeOnly = false }: { activeOnly?: boolean } = {}
  ): Promise<Agent | null> {
    const user = auth.user
    if (!user) {
      response.unauthorized({ message: 'Unauthenticated' })
      return null
    }

    try {
      return activeOnly
        ? await AgentIdentityService.requireActiveAgentForUser(user.id)
        : await AgentIdentityService.requireAgentForUser(user.id)
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
