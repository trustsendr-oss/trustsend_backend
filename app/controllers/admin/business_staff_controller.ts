import type { HttpContext } from '@adonisjs/core/http'
import type InternalUser from '#models/internal_user'
import vine from '@vinejs/vine'
import Agent from '#models/agent'
import Business from '#models/business'
import BusinessStaff from '#models/business_staff'
import User from '#models/user'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

const ROLES = ['teller', 'credit_officer', 'branch_manager', 'admin'] as const

const createValidator = vine.create({
  business_id: vine.number().positive(),
  user_id: vine.number().positive(),
  agent_id: vine.number().positive().optional(),
  role: vine.enum(ROLES),
})

const updateValidator = vine.create({
  agent_id: vine.number().positive().nullable().optional(),
  role: vine.enum(ROLES).optional(),
  status: vine.enum(['active', 'suspended', 'terminated'] as const).optional(),
})

/**
 * Staff administration for partner institutions — internal_user only.
 *
 * Kept on the admin side rather than given to institutions themselves for now: adding staff means
 * granting someone the ability to act for an institution, and until an institution's own admin role
 * is actually enforced on routes, that decision belongs with TumaPlus staff.
 *
 * Returns the full unpaginated collection like the other back-office list endpoints — the admin
 * data provider filters and sorts client-side (see admin/src/providers/dataProvider.ts).
 */
export default class AdminBusinessStaffController {
  /**
   * GET /api/v1/admin/business-staff
   */
  async index({ request, response }: HttpContext) {
    const businessId = request.input('business_id')

    const query = BusinessStaff.query().preload('business').preload('user').preload('agent')
    if (businessId) query.where('business_id', Number(businessId))

    const staff = await query.orderBy('id', 'asc')

    return response.ok({ data: staff.map((s) => this.serialize(s)) })
  }

  /**
   * GET /api/v1/admin/business-staff/:id
   */
  async show({ params, response }: HttpContext) {
    const staff = await BusinessStaff.query()
      .where('id', params.id)
      .preload('business')
      .preload('user')
      .preload('agent')
      .firstOrFail()

    return response.ok({ data: this.serialize(staff) })
  }

  /**
   * POST /api/v1/admin/business-staff
   */
  async store({ auth, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(createValidator)

    const business = await Business.find(payload.business_id)
    if (!business) {
      return response.notFound({ message: 'Business not found' })
    }
    if (!(await User.find(payload.user_id))) {
      return response.notFound({ message: 'User not found' })
    }

    // A counter belongs to exactly one institution; posting someone to another institution's
    // window would put them on the wrong side of the isolation boundary the whole design rests on.
    if (payload.agent_id !== undefined) {
      const agent = await Agent.find(payload.agent_id)
      if (!agent) {
        return response.notFound({ message: 'Agent not found' })
      }
      if (agent.businessId !== business.id) {
        return response.badRequest({
          message: 'That counter belongs to a different institution.',
          code: 'E_AGENT_OTHER_INSTITUTION',
        })
      }
    }

    const existing = await BusinessStaff.query()
      .where('business_id', payload.business_id)
      .where('user_id', payload.user_id)
      .first()
    if (existing) {
      return response.conflict({
        message: 'This person is already on staff at this institution.',
        code: 'E_ALREADY_STAFF',
      })
    }

    const staff = await BusinessStaff.create({
      businessId: payload.business_id,
      userId: payload.user_id,
      agentId: payload.agent_id ?? null,
      role: payload.role,
      status: 'active',
    })

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: actor.id,
      action: 'business_staff.created',
      resourceType: 'business_staff',
      resourceId: staff.id,
      before: undefined,
      after: { business_id: staff.businessId, user_id: staff.userId, role: staff.role },
      correlationId,
    })

    await staff.load('business')
    await staff.load('user')
    await staff.load('agent')

    return response.created({ data: this.serialize(staff) })
  }

  /**
   * PATCH /api/v1/admin/business-staff/:id — change a role, reassign a counter, or suspend.
   */
  async update({ auth, params, request, correlationId, response }: HttpContext) {
    const actor = (await auth.authenticateUsing(['internal'])) as InternalUser
    const payload = await request.validateUsing(updateValidator)

    const staff = await BusinessStaff.findOrFail(params.id)
    const before = { role: staff.role, status: staff.status, agent_id: staff.agentId }

    if (payload.agent_id !== undefined) {
      if (payload.agent_id === null) {
        staff.agentId = null
      } else {
        const agent = await Agent.find(payload.agent_id)
        if (!agent) {
          return response.notFound({ message: 'Agent not found' })
        }
        if (agent.businessId !== staff.businessId) {
          return response.badRequest({
            message: 'That counter belongs to a different institution.',
            code: 'E_AGENT_OTHER_INSTITUTION',
          })
        }
        staff.agentId = payload.agent_id
      }
    }
    if (payload.role !== undefined) staff.role = payload.role
    if (payload.status !== undefined) staff.status = payload.status

    await staff.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: actor.id,
      action: 'business_staff.updated',
      resourceType: 'business_staff',
      resourceId: staff.id,
      before,
      after: { role: staff.role, status: staff.status, agent_id: staff.agentId },
      correlationId,
    })

    await staff.load('business')
    await staff.load('user')
    await staff.load('agent')

    return response.ok({ data: this.serialize(staff) })
  }

  private serialize(staff: BusinessStaff) {
    return {
      id: staff.id,
      business_id: staff.businessId,
      business_name: staff.business?.name ?? null,
      user_id: staff.userId,
      user_name: staff.user?.fullName ?? staff.user?.email ?? staff.user?.code ?? null,
      agent_id: staff.agentId,
      agent_name: staff.agent?.fullName ?? null,
      role: staff.role,
      status: staff.status,
      created_at: staff.createdAt,
      updated_at: staff.updatedAt,
    }
  }
}
