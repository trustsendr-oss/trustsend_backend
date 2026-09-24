import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import Agent from '#models/agent'
import BusinessStaff from '#models/business_staff'
import TellerSession from '#models/teller_session'
import {
  InstitutionOutletService,
  OutletSessionOpenException,
  OutletTransitionException,
} from '#services/business/institution_outlet_service'
import { serializeOutlet } from '#controllers/business_dashboard/serialize_institution'

const openValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(255),
  phone: vine.string().trim().minLength(8).maxLength(20),
  city: vine.string().trim().maxLength(100).optional(),
  address: vine.string().trim().maxLength(500).optional(),
})

const updateValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(255).optional(),
  phone: vine.string().trim().minLength(8).maxLength(20).optional(),
  city: vine.string().trim().maxLength(100).nullable().optional(),
  address: vine.string().trim().maxLength(500).nullable().optional(),
})

const suspendValidator = vine.create({
  // Required: a closed window with no reason is a question every teller will ask the manager.
  reason: vine.string().trim().minLength(5).maxLength(500),
})

/**
 * An institution's own counters (its `agents` rows) — see InstitutionOutletService for why they
 * are the institution's to open and close, and why they are not TumaPlus network agents.
 *
 * Every lookup is scoped to ctx.business: another institution's counter is a 404, never a 403,
 * so its existence is not disclosed.
 */
export default class BusinessDashboardOutletsController {
  /** GET /api/v1/business/dashboard/outlets */
  async index({ business, response }: HttpContext) {
    const outlets = await Agent.query()
      .where('business_id', business.id)
      .orderByRaw('parent_agent_id IS NOT NULL')
      .orderBy('id', 'asc')

    const ids = outlets.map((outlet) => outlet.id)
    const staffCounts = ids.length
      ? await db
          .from('business_staff')
          .whereIn('agent_id', ids)
          .where('status', 'active')
          .select('agent_id')
          .count('* as count')
          .groupBy('agent_id')
      : []
    const openSessions = ids.length
      ? await TellerSession.query()
          .whereIn('agent_id', ids)
          .where('status', 'open')
          .preload('teller', (query) => query.preload('user'))
      : []

    return response.ok({
      data: outlets.map((outlet) => {
        const session = openSessions.find((row) => row.agentId === outlet.id)
        return serializeOutlet(outlet, {
          staffCount: Number(staffCounts.find((row) => row.agent_id === outlet.id)?.count ?? 0),
          openSession: session
            ? {
                id: session.id,
                opened_at: session.openedAt,
                staff_name: session.teller?.user?.fullName ?? null,
              }
            : null,
        })
      }),
    })
  }

  /** GET /api/v1/business/dashboard/outlets/:id — the counter and who works it. */
  async show({ business, params, response }: HttpContext) {
    const outlet = await this.owned(business.id, params.id)
    if (!outlet) return response.notFound({ message: 'Counter not found' })

    const staff = await BusinessStaff.query()
      .where('business_id', business.id)
      .where('agent_id', outlet.id)
      .preload('user')
      .orderBy('id', 'asc')

    return response.ok({
      data: {
        ...serializeOutlet(outlet, {
          staffCount: staff.filter((s) => s.status === 'active').length,
        }),
        staff: staff.map((member) => ({
          id: member.id,
          role: member.role,
          status: member.status,
          full_name: member.user?.fullName ?? null,
          code: member.user?.code ?? null,
        })),
      },
    })
  }

  /** POST /api/v1/business/dashboard/outlets */
  async store({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(openValidator)
    try {
      const outlet = await InstitutionOutletService.open(business, payload, correlationId)
      return response.created({ data: serializeOutlet(outlet, { staffCount: 0 }) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** PATCH /api/v1/business/dashboard/outlets/:id */
  async update({ business, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(updateValidator)
    const outlet = await this.owned(business.id, params.id)
    if (!outlet) return response.notFound({ message: 'Counter not found' })
    try {
      const updated = await InstitutionOutletService.update(
        business,
        outlet,
        payload,
        correlationId
      )
      return response.ok({ data: serializeOutlet(updated) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/business/dashboard/outlets/:id/suspend */
  async suspend({ business, params, request, correlationId, response }: HttpContext) {
    const { reason } = await request.validateUsing(suspendValidator)
    const outlet = await this.owned(business.id, params.id)
    if (!outlet) return response.notFound({ message: 'Counter not found' })
    try {
      const updated = await InstitutionOutletService.suspend(
        business,
        outlet,
        reason,
        correlationId
      )
      return response.ok({ data: serializeOutlet(updated) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** POST /api/v1/business/dashboard/outlets/:id/reactivate */
  async reactivate({ business, params, correlationId, response }: HttpContext) {
    const outlet = await this.owned(business.id, params.id)
    if (!outlet) return response.notFound({ message: 'Counter not found' })
    try {
      const updated = await InstitutionOutletService.reactivate(business, outlet, correlationId)
      return response.ok({ data: serializeOutlet(updated) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private owned(businessId: number, id: string) {
    return Agent.query().where('id', Number(id)).where('business_id', businessId).first()
  }

  private handle(error: unknown, response: HttpContext['response']) {
    if (error instanceof OutletSessionOpenException) {
      return response.conflict({ message: error.message, code: 'E_SESSION_OPEN' })
    }
    if (error instanceof OutletTransitionException) {
      return response.conflict({ message: error.message, code: 'E_COUNTER_STATE' })
    }
    throw error
  }
}
