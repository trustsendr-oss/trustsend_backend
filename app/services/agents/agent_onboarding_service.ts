import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import Wallet from '#models/wallet'
import LedgerAccount from '#models/ledger_account'
import AgentStatusHistory from '#models/agent_status_history'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

// Strict hierarchy: a parent may only sponsor a STRICTLY lower tier (master > distributor >
// super_agent > agent). Ranked instead of a single "agent can't have children" check — the old
// check let e.g. a super_agent parent sponsor a master child, inverting the hierarchy.
const TIER_RANK: Record<'agent' | 'super_agent' | 'distributor' | 'master', number> = {
  agent: 0,
  super_agent: 1,
  distributor: 2,
  master: 3,
}

export class AgentOnboardingService {
  /**
   * Create a new agent and allocate float wallet (USD by default)
   * Verifies parent agent exists and is active if specified
   */
  static async create(request: {
    userId: number
    code: string
    fullName: string
    email: string
    phone: string
    tier: 'agent' | 'super_agent' | 'distributor' | 'master'
    parentAgentId?: number
    region?: string
    businessName?: string
    address?: string
    city?: string
    latitude?: number
    longitude?: number
    commissionRate?: number
    dailyLimit?: bigint
    monthlyLimit?: bigint
    perTransactionLimit?: bigint
    correlationId: string
  }): Promise<Agent> {
    // Mirrors the DB's tier_parent_hierarchy CHECK constraint (18_add_commission_rate_constraint.ts)
    // with a friendly error instead of a raw Postgres constraint violation: master is always
    // top-level; agent/super_agent always need a sponsor; distributor can go either way.
    if (request.tier === 'master' && request.parentAgentId) {
      throw new Error('A master agent cannot have a parent agent')
    }
    if ((request.tier === 'agent' || request.tier === 'super_agent') && !request.parentAgentId) {
      throw new Error(`A ${request.tier} must have a parent agent`)
    }

    // Validate parent agent if specified
    if (request.parentAgentId) {
      const parentAgent = await Agent.find(request.parentAgentId)
      if (!parentAgent) {
        throw new Error(`Parent agent ${request.parentAgentId} not found`)
      }
      if (parentAgent.status !== 'active') {
        throw new Error('Parent agent must be active')
      }
      // Validate tier hierarchy: parent must strictly outrank the child (a super_agent parent
      // can only sponsor an agent, never a distributor or master; a distributor can sponsor an
      // agent or super_agent, etc).
      if (TIER_RANK[parentAgent.tier] <= TIER_RANK[request.tier]) {
        throw new Error(
          `A ${parentAgent.tier} cannot sponsor a ${request.tier} — parent tier must be strictly higher than the child's`
        )
      }
    }
    return db.transaction(async (trx) => {
      // Create the agent first (walletId set below, once the wallet exists) — wallets.* has a
      // "exactly one owner" CHECK constraint, so the wallet row itself can't be inserted before
      // agent.id exists to populate agent_id on it.
      const agent = new Agent()
      agent.userId = request.userId
      agent.code = request.code
      agent.fullName = request.fullName
      agent.email = request.email
      agent.phone = request.phone
      agent.tier = request.tier
      agent.parentAgentId = request.parentAgentId || null
      agent.region = request.region || null
      agent.businessName = request.businessName || null
      agent.address = request.address || null
      agent.city = request.city || null
      agent.latitude = request.latitude ?? null
      agent.longitude = request.longitude ?? null
      agent.commissionRate = request.commissionRate ?? 2.5
      agent.dailyLimit = request.dailyLimit ?? null
      agent.monthlyLimit = request.monthlyLimit ?? null
      agent.perTransactionLimit = request.perTransactionLimit ?? null
      agent.status = 'pending_approval'

      await agent.useTransaction(trx).save()

      // Create ledger account for agent wallet (USD by default)
      const account = new LedgerAccount()
      account.code = `AGENT_WALLET.${request.code}`
      account.name = `Wallet for agent ${request.fullName}`
      account.accountType = 'asset'
      account.ownerType = 'agent_wallet'
      account.ownerId = agent.id
      account.currencyCode = 'USD'
      account.status = 'active'

      await account.useTransaction(trx).save()

      // Create wallet (USD by default) — agentId set immediately, satisfying wallets_single_owner
      const wallet = new Wallet()
      wallet.agentId = agent.id
      wallet.ledgerAccountId = account.id
      wallet.currencyCode = 'USD'
      wallet.balanceCache = 0n
      wallet.status = 'active'

      await wallet.useTransaction(trx).save()

      // owner_id must reference the wallet's own id (see user_onboarding_service.ts) — it can
      // only be set now that the wallet exists.
      account.ownerId = wallet.id
      await account.useTransaction(trx).save()

      agent.walletId = wallet.id
      await agent.useTransaction(trx).save()

      // Record status history
      const history = new AgentStatusHistory()
      history.agentId = agent.id
      history.previousStatus = 'pending_approval'
      history.newStatus = 'pending_approval'
      history.changedBy = 'system'
      history.reason = 'Agent created and pending approval'

      await history.useTransaction(trx).save()

      // Audit
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'agent.created',
        resourceType: 'agent',
        resourceId: agent.id,
        before: undefined,
        after: {
          code: agent.code,
          tier: agent.tier,
          status: agent.status,
          parent_agent_id: agent.parentAgentId,
        },
        correlationId: request.correlationId,
        trx,
      })

      return agent
    })
  }

  /**
   * Initiate onboarding for newly created agent
   */
  static async initiate(agentId: number): Promise<Agent> {
    const agent = await Agent.findOrFail(agentId)

    // In production: trigger KYC verification, send onboarding email, etc.
    // For now: just return the agent
    return agent
  }
}
