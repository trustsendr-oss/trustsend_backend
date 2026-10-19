import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Agent from '#models/agent'
import Wallet from '#models/wallet'
import AgentStatusHistory from '#models/agent_status_history'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class AgentTerminationService {
  /**
   * Terminate an agent
   * REQUIRES: every float wallet of the agent must have zero balance
   * Cannot terminate if agent still holds float, in any currency
   */
  static async terminate(
    agentId: number,
    terminatedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Agent> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(agentId, { client: trx })

      // Every float, in every currency the agent ever held — not just agents.wallet_id (USD).
      const wallets = await Wallet.query({ client: trx })
        .where('agent_id', agent.id)
        .orderBy('id', 'asc')
        .forUpdate()

      const funded = wallets.filter((w) => w.balanceCache !== 0n)
      if (funded.length > 0) {
        const held = funded.map((w) => `${w.currencyCode} ${w.balanceCache}`).join(', ')
        throw new Error(
          `Cannot terminate agent with non-zero float (${held}). The agent must move it to their personal wallet first (POST /agents/float-withdraw).`
        )
      }

      // Capture the pre-mutation status before overwriting it below — history/audit must
      // record what the agent transitioned FROM, not the 'terminated' value it's about to become.
      const previousStatus = agent.status

      // Terminate agent
      agent.status = 'terminated'
      agent.terminatedAt = DateTime.now()
      agent.terminationReason = reason

      await agent.useTransaction(trx).save()

      for (const wallet of wallets) {
        wallet.status = 'closed'
        await wallet.useTransaction(trx).save()
      }

      // Record status history
      const history = new AgentStatusHistory()
      history.agentId = agent.id
      history.previousStatus = previousStatus
      history.newStatus = 'terminated'
      history.changedBy = 'internal_user'
      history.changedById = terminatedBy
      history.reason = reason

      await history.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: terminatedBy,
        action: 'agent.terminated',
        resourceType: 'agent',
        resourceId: agent.id,
        before: { status: previousStatus, closed_wallet_ids: wallets.map((w) => w.id) },
        after: { status: 'terminated', reason },
        correlationId,
        trx,
      })

      return agent
    })
  }
}
