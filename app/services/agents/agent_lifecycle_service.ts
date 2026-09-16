import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Agent from '#models/agent'
import AgentStatusHistory from '#models/agent_status_history'
import KycVerification from '#models/kyc_verification'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

export class AgentLifecycleService {
  /**
   * Approve an agent (transition from pending_approval → active)
   *
   * Requires an approved KYC verification for this agent (subject_type='agent'), submitted via
   * POST /api/v1/agents/kyc/submit — mirrors BusinessLifecycleService.approve()'s KYB gate.
   * Before this, an agent (who handles physical cash and holds a real float) could be activated
   * with zero identity verification, unlike a Business, which was already gated this way.
   */
  static async approve(agentId: number, approvedBy: number, correlationId: string): Promise<Agent> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(agentId, { client: trx })

      if (agent.status !== 'pending_approval') {
        throw new Error('Agent must be in pending_approval status')
      }

      const approvedKyc = await KycVerification.query({ client: trx })
        .where('subject_type', 'agent')
        .where('subject_id', agentId)
        .where('status', 'approved')
        .first()

      if (!approvedKyc) {
        throw new Error('Agent KYC must be approved before the agent itself can be approved')
      }

      agent.status = 'active'
      agent.approvedAt = DateTime.now()
      agent.approvedBy = approvedBy

      await agent.useTransaction(trx).save()

      // Record status history
      const history = new AgentStatusHistory()
      history.agentId = agent.id
      history.previousStatus = 'pending_approval'
      history.newStatus = 'active'
      history.changedBy = 'internal_user'
      history.changedById = approvedBy
      history.reason = 'Agent approved by compliance'

      await history.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: approvedBy,
        action: 'agent.approved',
        resourceType: 'agent',
        resourceId: agent.id,
        before: { status: 'pending_approval' },
        after: { status: 'active' },
        correlationId,
        trx,
      })

      return agent
    })
  }

  /**
   * Suspend an agent (active → suspended)
   */
  static async suspend(
    agentId: number,
    suspendedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Agent> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(agentId, { client: trx })

      if (agent.status !== 'active') {
        throw new Error('Only active agents can be suspended')
      }

      agent.status = 'suspended'
      agent.suspendedAt = DateTime.now()
      agent.suspensionReason = reason

      await agent.useTransaction(trx).save()

      // Record status history
      const history = new AgentStatusHistory()
      history.agentId = agent.id
      history.previousStatus = 'active'
      history.newStatus = 'suspended'
      history.changedBy = 'internal_user'
      history.changedById = suspendedBy
      history.reason = reason

      await history.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: suspendedBy,
        action: 'agent.suspended',
        resourceType: 'agent',
        resourceId: agent.id,
        before: { status: 'active' },
        after: { status: 'suspended', reason },
        correlationId,
        trx,
      })

      return agent
    })
  }

  /**
   * Activate a suspended agent (suspended → active)
   */
  static async activate(
    agentId: number,
    reactivatedBy: number,
    correlationId: string
  ): Promise<Agent> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(agentId, { client: trx })

      if (agent.status !== 'suspended') {
        throw new Error('Only suspended agents can be reactivated')
      }

      agent.status = 'active'
      agent.suspendedAt = null
      agent.suspensionReason = null
      await agent.useTransaction(trx).save()

      // Record status history
      const history = new AgentStatusHistory()
      history.agentId = agent.id
      history.previousStatus = 'suspended'
      history.newStatus = 'active'
      history.changedBy = 'internal_user'
      history.changedById = reactivatedBy
      history.reason = 'Agent reactivated'

      await history.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: reactivatedBy,
        action: 'agent.reactivated',
        resourceType: 'agent',
        resourceId: agent.id,
        before: { status: 'suspended' },
        after: { status: 'active' },
        correlationId,
        trx,
      })

      return agent
    })
  }

  /**
   * Deactivate an agent (terminate using proper service)
   */
  static async deactivate(
    agentId: number,
    terminatedBy: number,
    reason: string,
    correlationId: string
  ): Promise<Agent> {
    // Import at usage to avoid circular dependencies
    const { AgentTerminationService } = await import('#services/agents/agent_termination_service')
    return AgentTerminationService.terminate(agentId, terminatedBy, reason, correlationId)
  }
}
