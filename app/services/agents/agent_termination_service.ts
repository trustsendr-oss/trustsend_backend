import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Agent from '#models/agent'
import Wallet from '#models/wallet'
import AgentStatusHistory from '#models/agent_status_history'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class AgentTerminationService {
  /**
   * Terminate an agent
   * REQUIRES: agent wallet must have zero balance
   * Cannot terminate if agent still holds float
   */
  static async terminate(
    agentId: number,
    terminatedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Agent> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(agentId, { client: trx })

      if (!agent.walletId) {
        throw new Error('Agent has no wallet')
      }

      // Verify wallet has zero balance
      const wallet = await Wallet.findOrFail(agent.walletId, { client: trx })

      if (wallet.balanceCache !== 0n) {
        throw new Error(
          `Cannot terminate agent with non-zero balance (${wallet.balanceCache}). Must settle float first.`
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

      // Freeze wallet
      wallet.status = 'closed'
      await wallet.useTransaction(trx).save()

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
        before: { status: previousStatus, walletBalance: wallet.balanceCache.toString() },
        after: { status: 'terminated', reason },
        correlationId,
        trx,
      })

      return agent
    })
  }
}
