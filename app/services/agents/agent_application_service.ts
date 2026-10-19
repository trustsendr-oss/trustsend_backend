import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Agent from '#models/agent'
import AgentApplication from '#models/agent_application'
import User from '#models/user'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AgentEligibilityService } from '#services/agents/agent_eligibility_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'

type Tier = 'agent' | 'super_agent' | 'distributor' | 'master'

/** A user-actionable refusal; controllers map it to 4xx with its `code`. */
export class AgentApplicationException extends Error {
  constructor(
    message: string,
    public code: string,
    public status: 404 | 409 | 422 = 422
  ) {
    super(message)
    this.name = 'AgentApplicationException'
  }
}

const OPEN_STATUSES = ['submitted', 'under_review'] as const

/**
 * "Become an agent": a customer asks, an internal reviewer decides.
 *
 * Approval does not make anyone an operating agent on the spot. It creates the agent record in
 * `pending_approval` through AgentOnboardingService — the same path as an admin-created agent —
 * so the usual gates still apply afterwards: the agent's own KYC, then the explicit approval in
 * AgentLifecycleService. An application is a way in, never a shortcut past compliance.
 */
export class AgentApplicationService {
  /** The applicant's most recent application, whatever its status. */
  static async latestFor(userId: number): Promise<AgentApplication | null> {
    return AgentApplication.query()
      .where('applicant_user_id', userId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .first()
  }

  static async submit(
    user: User,
    input: {
      businessName: string
      phone: string
      city: string
      region?: string
      address?: string
      motivation?: string
      sponsorCode?: string
    },
    correlationId: string
  ): Promise<AgentApplication> {
    if (await Agent.query().where('user_id', user.id).first()) {
      throw new AgentApplicationException(
        'This account is already linked to an agent',
        'ALREADY_AGENT',
        409
      )
    }

    const open = await AgentApplication.query()
      .where('applicant_user_id', user.id)
      .whereIn('status', [...OPEN_STATUSES])
      .first()
    if (open) {
      throw new AgentApplicationException(
        'You already have an application under review',
        'APPLICATION_OPEN',
        409
      )
    }

    await this.assertEligible(user.id, 'applicant')

    let sponsorId: number | null = null
    if (input.sponsorCode) {
      const sponsor = await Agent.query().where('code', input.sponsorCode).first()
      // An institution's counter cannot sponsor into the TumaPlus network, and only an agent who
      // can actually push float down (any tier above `agent`) is a meaningful sponsor.
      if (
        !sponsor ||
        sponsor.status !== 'active' ||
        sponsor.businessId ||
        sponsor.tier === 'agent'
      ) {
        throw new AgentApplicationException(
          'This sponsor code does not match an agent who can sponsor you',
          'INVALID_SPONSOR'
        )
      }
      sponsorId = sponsor.id
    }

    const application = new AgentApplication()
    application.applicantUserId = user.id
    // What the applicant can realistically be: the bottom tier. The reviewer sets the final tier.
    application.tier = 'agent'
    application.sponsorAgentId = sponsorId
    application.status = 'submitted'
    application.businessName = input.businessName
    application.phone = input.phone
    application.city = input.city
    application.region = input.region ?? null
    application.address = input.address ?? null
    application.motivation = input.motivation ?? null

    try {
      await application.save()
    } catch (error) {
      // The partial unique index is the real guard against a double submit racing the check above.
      if ((error as { code?: string }).code === '23505') {
        throw new AgentApplicationException(
          'You already have an application under review',
          'APPLICATION_OPEN',
          409
        )
      }
      throw error
    }

    await AuditLoggerService.record({
      actorType: 'user',
      actorId: user.id,
      action: 'agent_application.submitted',
      resourceType: 'agent_application',
      resourceId: application.id,
      before: undefined,
      after: { status: 'submitted', sponsor_agent_id: sponsorId },
      correlationId,
    })

    return application
  }

  static async markUnderReview(
    applicationId: number,
    reviewerId: number,
    correlationId: string
  ): Promise<AgentApplication> {
    const application = await AgentApplication.findOrFail(applicationId)
    if (application.status !== 'submitted') {
      throw new AgentApplicationException(
        'Only a submitted application can be taken under review',
        'APPLICATION_STATE',
        409
      )
    }
    application.status = 'under_review'
    application.reviewedBy = reviewerId
    await application.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: reviewerId,
      action: 'agent_application.under_review',
      resourceType: 'agent_application',
      resourceId: application.id,
      before: { status: 'submitted' },
      after: { status: 'under_review' },
      correlationId,
    })
    return application
  }

  /**
   * Accept the application: creates the agent record (pending_approval) linked to the applicant.
   * The reviewer decides the tier and the parent; the applicant's proposed sponsor is only the
   * default parent.
   */
  static async approve(
    applicationId: number,
    reviewerId: number,
    decision: {
      tier: Tier
      /**
       * Contact e-mail for the agent record. Defaults to the applicant's account e-mail;
       * agents.email is unique, so a reviewer supplies another one when that address is
       * already used by a different agent record.
       */
      email?: string
      parentAgentId?: number
      commissionRate?: number
      dailyLimit?: bigint
      monthlyLimit?: bigint
      perTransactionLimit?: bigint
    },
    correlationId: string
  ): Promise<{ application: AgentApplication; agent: Agent }> {
    const application = await AgentApplication.findOrFail(applicationId)
    if (!OPEN_STATUSES.includes(application.status as (typeof OPEN_STATUSES)[number])) {
      throw new AgentApplicationException(
        'This application has already been decided',
        'APPLICATION_STATE',
        409
      )
    }

    const applicant = await User.findOrFail(application.applicantUserId)
    // agents.user_id is unique: a second approval (two reviewers, a retry) must fail cleanly.
    if (await Agent.query().where('user_id', applicant.id).first()) {
      throw new AgentApplicationException(
        'The applicant is already linked to an agent',
        'ALREADY_AGENT',
        409
      )
    }
    // Checked again at decision time: the balance may have been spent since the application.
    await this.assertEligible(applicant.id, 'reviewer')

    const email = (decision.email ?? applicant.email)?.trim()
    if (!email) {
      throw new AgentApplicationException(
        'The applicant has no e-mail address, which an agent record requires',
        'APPLICANT_NO_EMAIL'
      )
    }

    // agents.email is unique. Caught here with a readable message rather than surfacing the raw
    // `agents_email_unique` violation from the insert.
    const emailOwner = await Agent.query()
      .whereRaw('lower(email) = ?', [email.toLowerCase()])
      .first()
    if (emailOwner) {
      throw new AgentApplicationException(
        `The e-mail ${email} is already used by agent #${emailOwner.id} (${emailOwner.businessName ?? emailOwner.fullName}). Enter another contact e-mail for this agent.`,
        'AGENT_EMAIL_TAKEN',
        409
      )
    }

    // AgentOnboardingService validates tier/parent consistency and throws plain Errors with a
    // readable message; those bubble up as a 400 from the controller.
    const agent = await AgentOnboardingService.create({
      userId: applicant.id,
      fullName: applicant.fullName ?? application.businessName ?? `Agent ${applicant.id}`,
      email,
      phone: application.phone ?? '',
      tier: decision.tier,
      parentAgentId: decision.parentAgentId ?? application.sponsorAgentId ?? undefined,
      region: application.region ?? undefined,
      businessName: application.businessName ?? undefined,
      address: application.address ?? undefined,
      city: application.city ?? undefined,
      commissionRate: decision.commissionRate,
      dailyLimit: decision.dailyLimit,
      monthlyLimit: decision.monthlyLimit,
      perTransactionLimit: decision.perTransactionLimit,
      correlationId,
    })

    await db.transaction(async (trx) => {
      application.useTransaction(trx)
      application.status = 'approved'
      application.tier = decision.tier
      application.reviewedBy = reviewerId
      application.reviewedAt = DateTime.now()
      application.approvedAgentId = agent.id
      await application.save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: reviewerId,
        action: 'agent_application.approved',
        resourceType: 'agent_application',
        resourceId: application.id,
        before: { status: 'submitted_or_under_review' },
        after: { status: 'approved', agent_id: agent.id, tier: decision.tier },
        correlationId,
        trx,
      })
    })

    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: applicant.id,
      type: 'agent_application.approved',
      title: 'Demande agent acceptée',
      message:
        "Votre demande a été acceptée. Ouvrez l'onglet Agent pour envoyer vos pièces d'identité et activer votre compte agent.",
      data: { application_id: application.id, agent_id: agent.id },
    })

    return { application, agent }
  }

  static async reject(
    applicationId: number,
    reviewerId: number,
    reason: string,
    correlationId: string
  ): Promise<AgentApplication> {
    const application = await AgentApplication.findOrFail(applicationId)
    if (!OPEN_STATUSES.includes(application.status as (typeof OPEN_STATUSES)[number])) {
      throw new AgentApplicationException(
        'This application has already been decided',
        'APPLICATION_STATE',
        409
      )
    }

    const previous = application.status
    application.status = 'rejected'
    application.rejectionReason = reason
    application.reviewedBy = reviewerId
    application.reviewedAt = DateTime.now()
    await application.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: reviewerId,
      action: 'agent_application.rejected',
      resourceType: 'agent_application',
      resourceId: application.id,
      before: { status: previous },
      after: { status: 'rejected', reason },
      correlationId,
    })

    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: application.applicantUserId,
      type: 'agent_application.rejected',
      title: 'Demande agent refusée',
      message: `Votre demande pour devenir agent n'a pas été retenue. Motif : ${reason}`,
      data: { application_id: application.id },
    })

    return application
  }

  /**
   * @throws AgentApplicationException INSUFFICIENT_BALANCE when the applicant holds less than
   *   100 USD (USD + CDF equivalent, available balance). The message differs by audience: the
   *   applicant is told what is required, the reviewer that the applicant no longer qualifies.
   */
  private static async assertEligible(userId: number, audience: 'applicant' | 'reviewer') {
    const eligibility = await AgentEligibilityService.evaluate(userId)
    if (eligibility.eligible) return
    throw new AgentApplicationException(
      audience === 'applicant'
        ? 'You need at least 100 USD (or the equivalent in CDF) on your account to become an agent'
        : 'The applicant no longer holds the required 100 USD (or CDF equivalent)',
      'INSUFFICIENT_BALANCE'
    )
  }

  /** Shape shared by the applicant and admin endpoints (admin adds applicant/sponsor details). */
  static async serialize(application: AgentApplication, { withApplicant = false } = {}) {
    const open = OPEN_STATUSES.includes(application.status as (typeof OPEN_STATUSES)[number])
    const [sponsor, applicant, eligibility] = await Promise.all([
      application.sponsorAgentId ? Agent.find(application.sponsorAgentId) : null,
      withApplicant ? User.find(application.applicantUserId) : null,
      // Reviewers see whether the applicant still qualifies before deciding.
      withApplicant && open ? AgentEligibilityService.evaluate(application.applicantUserId) : null,
    ])

    return {
      id: application.id,
      status: application.status,
      tier: application.tier,
      business_name: application.businessName,
      phone: application.phone,
      city: application.city,
      region: application.region,
      address: application.address,
      motivation: application.motivation,
      rejection_reason: application.rejectionReason,
      approved_agent_id: application.approvedAgentId,
      sponsor: sponsor
        ? {
            id: sponsor.id,
            code: sponsor.code,
            name: sponsor.businessName ?? sponsor.fullName,
            tier: sponsor.tier,
          }
        : null,
      applicant: applicant
        ? {
            id: applicant.id,
            full_name: applicant.fullName,
            email: applicant.email,
            code: applicant.code,
          }
        : undefined,
      applicant_user_id: withApplicant ? application.applicantUserId : undefined,
      eligibility: eligibility ?? undefined,
      reviewed_at: application.reviewedAt,
      created_at: application.createdAt,
    }
  }
}
