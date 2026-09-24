import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import BusinessStaff from '#models/business_staff'
import {
  InstitutionStaffService,
  StaffRuleException,
} from '#services/business/institution_staff_service'
import { serializeStaff } from '#controllers/business_dashboard/serialize_institution'

const ROLES = ['teller', 'credit_officer', 'branch_manager', 'admin'] as const

const createValidator = vine.create({
  role: vine.enum(ROLES),
  agent_id: vine.number().positive().nullable().optional(),
  user_code: vine
    .string()
    .regex(/^\d{9}$/)
    .optional(),
  full_name: vine.string().trim().minLength(2).maxLength(255).optional(),
  email: vine.string().trim().email().maxLength(254).optional(),
})

const updateValidator = vine.create({
  role: vine.enum(ROLES).optional(),
  agent_id: vine.number().positive().nullable().optional(),
  status: vine.enum(['active', 'suspended', 'terminated'] as const).optional(),
})

/**
 * An institution's people — the self-service counterpart of admin/business_staff_controller.ts.
 * The rules (one institution per person, tellers need a counter, no change while a drawer is
 * open) live in InstitutionStaffService so the admin side can adopt them too.
 */
export default class BusinessDashboardStaffController {
  /** GET /api/v1/business/dashboard/staff */
  async index({ business, response }: HttpContext) {
    const staff = await BusinessStaff.query()
      .where('business_id', business.id)
      .preload('user')
      .preload('agent')
      .orderByRaw(`CASE status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END`)
      .orderBy('id', 'asc')

    return response.ok({ data: staff.map(serializeStaff) })
  }

  /**
   * POST /api/v1/business/dashboard/staff
   *
   * When a new account is created its password is returned HERE ONLY, for the institution to hand
   * to the person, who should change it at first sign-in. Only its hash is kept.
   */
  async store({ business, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(createValidator)
    try {
      const { staff, generatedPassword } = await InstitutionStaffService.add(
        business,
        {
          role: payload.role,
          agentId: payload.agent_id ?? null,
          userCode: payload.user_code,
          fullName: payload.full_name,
          email: payload.email,
        },
        correlationId
      )
      await staff.load('user')
      await staff.load('agent')
      return response.created({
        data: { ...serializeStaff(staff), generated_password: generatedPassword },
      })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  /** PATCH /api/v1/business/dashboard/staff/:id — role, counter posting, suspension. */
  async update({ business, params, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(updateValidator)
    const staff = await BusinessStaff.query()
      .where('id', Number(params.id))
      .where('business_id', business.id)
      .first()
    if (!staff) return response.notFound({ message: 'Staff member not found' })

    try {
      await InstitutionStaffService.update(
        business,
        staff,
        { role: payload.role, agentId: payload.agent_id, status: payload.status },
        correlationId
      )
      await staff.load('user')
      await staff.load('agent')
      return response.ok({ data: serializeStaff(staff) })
    } catch (error) {
      return this.handle(error, response)
    }
  }

  private handle(error: unknown, response: HttpContext['response']) {
    if (error instanceof StaffRuleException) {
      return response.status(error.status).send({ message: error.message, code: error.code })
    }
    throw error
  }
}
