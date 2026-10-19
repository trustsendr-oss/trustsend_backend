import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import AgentStatusHistory from '#models/agent_status_history'
import type Business from '#models/business'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { TellerSessionService } from '#services/counter/teller_session_service'

export class OutletTransitionException extends Error {
  constructor(from: string, action: string) {
    super(`A counter in status "${from}" cannot be ${action}`)
    this.name = 'OutletTransitionException'
  }
}

export class OutletSessionOpenException extends Error {
  constructor() {
    super('This counter has a drawer open: close it before changing the counter')
    this.name = 'OutletSessionOpenException'
  }
}

/**
 * An institution running its own branch network: opening counters, editing them, suspending and
 * reactivating them.
 *
 * ## A counter is not a TumaPlus agent
 *
 * It lives in the same `agents` table because it needs the same things — a float wallet, a code a
 * customer can quote, a place in a hierarchy — but it belongs to the institution
 * (`agents.business_id`), it has no account of its own (`user_id` is null), and nobody signs in as
 * it: the people working it are `business_staff` rows posted to it. A TumaPlus network agent is a
 * person under contract with TumaPlus; a counter is a window of the institution's own.
 *
 * ## Why no TumaPlus approval step
 *
 * A network agent is vetted one by one because TumaPlus answers for them. A counter is vetted
 * through its institution, whose KYB TumaPlus has already approved and which answers for what
 * happens at its own windows — that is the point of separating the two. Requiring compliance to
 * approve every new window would put TumaPlus in the middle of an institution's own branch
 * planning without adding any check the institution's approval did not already make. The route is
 * behind businessActive(), so only an institution that passed KYB opens counters, and every
 * transition is audited under the institution's name.
 *
 * `agent_status_history.changed_by` only knows 'system' and 'internal_user'; an institution's act
 * is recorded as 'system' there with the institution named in the reason, and fully attributed in
 * the audit log, which does know businesses.
 */
export class InstitutionOutletService {
  /** The top-level counter every other one hangs off, if the institution has one yet. */
  static async headOffice(businessId: number): Promise<Agent | null> {
    return Agent.query()
      .where('business_id', businessId)
      .whereNull('parent_agent_id')
      .whereNot('status', 'terminated')
      .orderBy('id', 'asc')
      .first()
  }

  /**
   * Opens a counter, active immediately. The first one becomes the head office (tier
   * `distributor`, top-level); every later one is a counter (tier `agent`) under it — the same
   * shape imf:create builds, so an institution onboarded either way looks the same.
   */
  static async open(
    business: Business,
    details: { name: string; phone: string; city?: string | null; address?: string | null },
    correlationId: string
  ): Promise<Agent> {
    const head = await this.headOffice(business.id)
    if (head && head.status !== 'active') {
      // AgentOnboardingService refuses a parent that is not active; say why in the
      // institution's terms rather than the network's.
      throw new OutletTransitionException(head.status, 'used as the head office of a new counter')
    }

    const code = await this.uniqueCode()
    const domain = business.email.split('@')[1] ?? 'counters.tumaplus'

    const agent = await AgentOnboardingService.create({
      businessId: business.id,
      code,
      fullName: details.name,
      // agents.email is NOT NULL and unique; it is the counter's contact, never a credential.
      email: `counter-${code}@${domain}`.toLowerCase(),
      phone: details.phone,
      tier: head ? 'agent' : 'distributor',
      parentAgentId: head?.id,
      city: details.city ?? undefined,
      address: details.address ?? undefined,
      businessName: business.name,
      correlationId,
    })

    return this.transition(business, agent, {
      from: ['pending_approval'],
      to: 'active',
      action: 'opened',
      reason: `Opened by institution ${business.code}`,
      correlationId,
      apply: (row) => {
        row.approvedAt = DateTime.now()
        row.approvedBy = null
      },
    })
  }

  static async update(
    business: Business,
    agent: Agent,
    changes: { name?: string; phone?: string; city?: string | null; address?: string | null },
    correlationId: string
  ): Promise<Agent> {
    if (agent.status === 'terminated') throw new OutletTransitionException(agent.status, 'edited')

    const before = { name: agent.fullName, phone: agent.phone, city: agent.city }
    if (changes.name !== undefined) agent.fullName = changes.name
    if (changes.phone !== undefined) agent.phone = changes.phone
    if (changes.city !== undefined) agent.city = changes.city
    if (changes.address !== undefined) agent.address = changes.address
    await agent.save()

    await AuditLoggerService.record({
      actorType: 'business',
      actorId: business.id,
      action: 'counter.updated',
      resourceType: 'agent',
      resourceId: agent.id,
      before,
      after: { name: agent.fullName, phone: agent.phone, city: agent.city },
      correlationId,
    })
    return agent
  }

  /**
   * Closes a window for now. Refused while a drawer is open on it: suspending a counter with cash
   * in the drawer would leave a shift nobody can close, and the variance with it.
   */
  static async suspend(business: Business, agent: Agent, reason: string, correlationId: string) {
    if (await TellerSessionService.openSessionFor(agent.id)) throw new OutletSessionOpenException()
    return this.transition(business, agent, {
      from: ['active'],
      to: 'suspended',
      action: 'suspended',
      reason,
      correlationId,
      apply: (row) => {
        row.suspendedAt = DateTime.now()
        row.suspensionReason = reason
      },
    })
  }

  static async reactivate(business: Business, agent: Agent, correlationId: string) {
    return this.transition(business, agent, {
      from: ['suspended'],
      to: 'active',
      action: 'reactivated',
      reason: `Reactivated by institution ${business.code}`,
      correlationId,
      apply: (row) => {
        row.suspendedAt = null
        row.suspensionReason = null
      },
    })
  }

  private static async transition(
    business: Business,
    agent: Agent,
    step: {
      from: Agent['status'][]
      to: Agent['status']
      action: string
      reason: string
      correlationId: string
      apply: (agent: Agent) => void
    }
  ): Promise<Agent> {
    return db.transaction(async (trx) => {
      const row = await Agent.query({ client: trx }).where('id', agent.id).forUpdate().firstOrFail()
      if (!step.from.includes(row.status)) {
        throw new OutletTransitionException(row.status, step.action)
      }

      const previous = row.status
      row.status = step.to
      step.apply(row)
      await row.useTransaction(trx).save()

      const history = new AgentStatusHistory()
      history.agentId = row.id
      history.previousStatus = previous
      history.newStatus = step.to
      history.changedBy = 'system'
      history.changedById = null
      history.reason = step.reason
      await history.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: business.id,
        action: `counter.${step.action}`,
        resourceType: 'agent',
        resourceId: row.id,
        before: { status: previous },
        after: { status: step.to, reason: step.reason },
        correlationId: step.correlationId,
        trx,
      })

      return row
    })
  }

  private static async uniqueCode(): Promise<string> {
    return AgentOnboardingService.generateUniqueCode()
  }
}
