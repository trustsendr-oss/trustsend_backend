import type { HttpContext } from '@adonisjs/core/http'
import Agent from '#models/agent'
import User from '#models/user'
import type InternalUser from '#models/internal_user'
import { AgentLifecycleService } from '#services/agents/agent_lifecycle_service'
import { AgentOnboardingService } from '#services/agents/agent_onboarding_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import vine from '@vinejs/vine'

// Smallest-unit strings (no zero, no leading zeros) — same convention as card amounts.
const limitFields = {
  daily_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
  monthly_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
  per_transaction_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
}

// On update, `null` explicitly clears a limit back to uncapped — distinct from omitting the key
// (leave unchanged), which plain .optional() already allows.
const nullableLimitFields = {
  daily_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .nullable()
    .optional(),
  monthly_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .nullable()
    .optional(),
  per_transaction_limit: vine
    .string()
    .regex(/^[1-9]\d*$/)
    .nullable()
    .optional(),
}

const profileFields = {
  business_name: vine.string().maxLength(255).optional(),
  address: vine.string().maxLength(255).optional(),
  city: vine.string().maxLength(100).optional(),
  latitude: vine.number().min(-90).max(90).optional(),
  longitude: vine.number().min(-180).max(180).optional(),
}

const createAgentValidator = vine.create({
  user_id: vine
    .number()
    .positive()
    .unique(async (db, value) => {
      const agent = await db.from('agents').where('user_id', value).first()
      return !agent
    }),
  full_name: vine.string().minLength(3).maxLength(255),
  email: vine
    .string()
    .email()
    .unique(async (db, value) => {
      const agent = await db.from('agents').where('email', value).first()
      return !agent
    }),
  phone: vine.string().minLength(8).maxLength(20),
  region: vine.string().optional(),
  code: vine
    .string()
    .minLength(2)
    .maxLength(20)
    .unique(async (db, value) => {
      const agent = await db.from('agents').where('code', value).first()
      return !agent
    })
    .optional(),
  // A top-level agent (no parent) may only be 'master' or 'distributor'; 'agent'/'super_agent'
  // always need a parent — see tier_parent_hierarchy CHECK constraint on the agents table,
  // enforced with a friendly error in AgentOnboardingService.create().
  tier: vine.enum(['agent', 'super_agent', 'distributor', 'master']).optional(),
  parent_agent_id: vine.number().positive().optional(),
  commission_rate: vine.number().min(0).max(100).optional(),
  ...profileFields,
  ...limitFields,
})

const updateAgentValidator = vine.create({
  full_name: vine.string().minLength(3).maxLength(255).optional(),
  email: vine.string().email().optional(),
  phone: vine.string().minLength(8).maxLength(20).optional(),
  region: vine.string().optional(),
  ...profileFields,
  ...nullableLimitFields,
})

export default class AgentsController {
  /**
   * GET /api/v1/agents
   * List all agents (admin only)
   */
  async index({ response }: HttpContext) {
    const agents = await Agent.query().select('*')

    return response.ok({
      data: agents.map((agent) => ({
        id: agent.id,
        full_name: agent.fullName,
        business_name: agent.businessName,
        email: agent.email,
        tier: agent.tier,
        region: agent.region,
        city: agent.city,
        status: agent.status,
        created_at: agent.createdAt,
      })),
    })
  }

  /**
   * POST /api/v1/agents
   * Create new agent (admin only)
   */
  async store({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createAgentValidator)

    const linkedUser = await User.find(payload.user_id)
    if (!linkedUser) {
      return response.notFound({ message: `User ${payload.user_id} not found` })
    }

    try {
      const agent = await AgentOnboardingService.create({
        userId: payload.user_id,
        code: payload.code || IdGenerator.generateId('AG'),
        fullName: payload.full_name,
        email: payload.email,
        phone: payload.phone,
        region: payload.region,
        businessName: payload.business_name,
        address: payload.address,
        city: payload.city,
        latitude: payload.latitude,
        longitude: payload.longitude,
        dailyLimit: payload.daily_limit ? BigInt(payload.daily_limit) : undefined,
        monthlyLimit: payload.monthly_limit ? BigInt(payload.monthly_limit) : undefined,
        perTransactionLimit: payload.per_transaction_limit
          ? BigInt(payload.per_transaction_limit)
          : undefined,
        tier: payload.tier ?? 'agent',
        parentAgentId: payload.parent_agent_id,
        commissionRate: payload.commission_rate ?? 2.5,
        correlationId: (request as any).correlationId || 'unknown',
      })

      return response.created({
        data: {
          id: agent.id,
          full_name: agent.fullName,
          tier: agent.tier,
          parent_agent_id: agent.parentAgentId,
          email: agent.email,
          status: agent.status,
          wallet_id: agent.walletId,
          created_at: agent.createdAt,
        },
      })
    } catch (error) {
      // AgentOnboardingService.create() only ever throws plain Error for user-actionable
      // validation problems (bad parent, tier/hierarchy mismatch) — never a genuine server fault.
      const err = error as any
      return response.badRequest({ message: err.message || 'Agent creation failed' })
    }
  }

  /**
   * GET /api/v1/agents/:id
   * Get agent details
   */
  async show({ params, response }: HttpContext) {
    const agent = await Agent.findOrFail(params.id)

    return response.ok({
      data: {
        id: agent.id,
        code: agent.code,
        full_name: agent.fullName,
        business_name: agent.businessName,
        email: agent.email,
        phone: agent.phone,
        tier: agent.tier,
        parent_agent_id: agent.parentAgentId,
        region: agent.region,
        address: agent.address,
        city: agent.city,
        latitude: agent.latitude,
        longitude: agent.longitude,
        status: agent.status,
        wallet_id: agent.walletId,
        commission_rate: agent.commissionRate,
        daily_limit: agent.dailyLimit?.toString() ?? null,
        monthly_limit: agent.monthlyLimit?.toString() ?? null,
        per_transaction_limit: agent.perTransactionLimit?.toString() ?? null,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      },
    })
  }

  /**
   * PATCH /api/v1/agents/:id
   * Update agent details
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser

    const agent = await Agent.findOrFail(params.id)
    const payload = await request.validateUsing(updateAgentValidator)

    const beforeData = {
      full_name: agent.fullName,
      email: agent.email,
      phone: agent.phone,
      region: agent.region,
      business_name: agent.businessName,
      address: agent.address,
      city: agent.city,
      daily_limit: agent.dailyLimit?.toString() ?? null,
      monthly_limit: agent.monthlyLimit?.toString() ?? null,
      per_transaction_limit: agent.perTransactionLimit?.toString() ?? null,
    }

    agent.merge({
      fullName: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      region: payload.region,
      businessName: payload.business_name,
      address: payload.address,
      city: payload.city,
      latitude: payload.latitude,
      longitude: payload.longitude,
      ...(payload.daily_limit !== undefined
        ? { dailyLimit: payload.daily_limit === null ? null : BigInt(payload.daily_limit) }
        : {}),
      ...(payload.monthly_limit !== undefined
        ? { monthlyLimit: payload.monthly_limit === null ? null : BigInt(payload.monthly_limit) }
        : {}),
      ...(payload.per_transaction_limit !== undefined
        ? {
            perTransactionLimit:
              payload.per_transaction_limit === null ? null : BigInt(payload.per_transaction_limit),
          }
        : {}),
    })
    await agent.save()

    // ✅ Add audit logging
    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: user.id,
      action: 'agent.updated',
      resourceType: 'agent',
      resourceId: agent.id,
      before: beforeData,
      after: {
        full_name: agent.fullName,
        email: agent.email,
        phone: agent.phone,
        region: agent.region,
        business_name: agent.businessName,
        address: agent.address,
        city: agent.city,
        daily_limit: agent.dailyLimit?.toString() ?? null,
        monthly_limit: agent.monthlyLimit?.toString() ?? null,
        per_transaction_limit: agent.perTransactionLimit?.toString() ?? null,
      },
      correlationId: (request as any).correlationId || 'unknown',
    })

    return response.ok({
      data: {
        id: agent.id,
        full_name: agent.fullName,
        business_name: agent.businessName,
        email: agent.email,
        address: agent.address,
        city: agent.city,
        latitude: agent.latitude,
        longitude: agent.longitude,
        daily_limit: agent.dailyLimit?.toString() ?? null,
        monthly_limit: agent.monthlyLimit?.toString() ?? null,
        per_transaction_limit: agent.perTransactionLimit?.toString() ?? null,
        status: agent.status,
        updated_at: agent.updatedAt,
        updated_by: user.id,
      },
    })
  }

  /**
   * POST /api/v1/agents/:id/approve
   * Approve a newly created agent (pending_approval → active)
   */
  async approve({ auth, params, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const agent = await Agent.findOrFail(params.id)

    try {
      const correlationId = (response.request as any).correlationId || 'unknown'

      const updated = await AgentLifecycleService.approve(agent.id, user.id, correlationId)

      return response.ok({
        data: {
          id: updated.id,
          status: updated.status,
          message: 'Agent approved',
          approved_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Approval failed' })
    }
  }

  /**
   * POST /api/v1/agents/:id/activate
   * Activate agent account (from suspended to active)
   */
  async activate({ auth, params, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const agent = await Agent.findOrFail(params.id)

    try {
      const correlationId = (response.request as any).correlationId || 'unknown'

      const updated = await AgentLifecycleService.activate(agent.id, user.id, correlationId)

      return response.ok({
        data: {
          id: updated.id,
          status: updated.status,
          message: 'Agent activated',
          activated_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Activation failed' })
    }
  }

  /**
   * POST /api/v1/agents/:id/suspend
   * Suspend agent account (requires reason in body)
   */
  async suspend({ auth, params, request, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const agent = await Agent.findOrFail(params.id)

    const suspendValidator = vine.create({
      reason: vine.string().minLength(10).maxLength(255),
    })
    const { reason } = await request.validateUsing(suspendValidator)

    try {
      const correlationId = (request as any).correlationId || 'unknown'

      const updated = await AgentLifecycleService.suspend(agent.id, user.id, reason, correlationId)

      return response.ok({
        data: {
          id: updated.id,
          status: updated.status,
          message: 'Agent suspended',
          suspended_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Suspension failed' })
    }
  }

  /**
   * POST /api/v1/agents/:id/deactivate
   * Deactivate/terminate agent (requires reason in body)
   */
  async deactivate({ auth, params, request, response }: HttpContext) {
    const user = (await auth.authenticateUsing(['internal'])) as InternalUser
    const agent = await Agent.findOrFail(params.id)

    const terminateValidator = vine.create({
      reason: vine.string().minLength(10).maxLength(255),
    })
    const { reason } = await request.validateUsing(terminateValidator)

    try {
      const correlationId = (request as any).correlationId || 'unknown'

      const updated = await AgentLifecycleService.deactivate(
        agent.id,
        user.id,
        reason,
        correlationId
      )

      return response.ok({
        data: {
          id: updated.id,
          status: updated.status,
          message: 'Agent terminated',
          terminated_by: user.id,
        },
      })
    } catch (error) {
      const err = error as any
      return response.badRequest({ message: err.message || 'Termination failed' })
    }
  }
}
