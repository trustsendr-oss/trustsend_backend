import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import AuditLog from '#models/audit_log'

const listValidator = vine.create({
  page: vine.number().positive().min(1).optional(),
  limit: vine.number().positive().min(1).max(100).optional(),
})

const VALID_ACTOR_TYPES = ['user', 'agent', 'internal_user', 'system', 'business']

/**
 * Read-only view over AuditLog — every admin action already writes here via
 * AuditLoggerService.record() (agents, businesses, kyc, disputes, plans, internal-users all call
 * it), but until now there was no way to actually browse the trail it produces. Paginated like
 * admin/transactions — audit volume grows with every admin action taken, unbounded.
 */
export default class AdminAuditLogsController {
  /**
   * GET /api/v1/admin/audit-logs
   * Filters: actor_type, actor_id, resource_type, resource_id, action, date_from, date_to.
   */
  async index({ request, response }: HttpContext) {
    const { page: pageInput, limit: limitInput } = await request.validateUsing(listValidator)
    const page = pageInput || 1
    const limit = limitInput || 25

    const actorType = request.input('actor_type') as string | undefined
    if (actorType && !VALID_ACTOR_TYPES.includes(actorType)) {
      return response.badRequest({ message: `Invalid actor_type filter: ${actorType}` })
    }

    const actorId = request.input('actor_id') as string | undefined
    const resourceType = request.input('resource_type') as string | undefined
    const resourceId = request.input('resource_id') as string | undefined
    const action = request.input('action') as string | undefined
    const dateFrom = request.input('date_from') as string | undefined
    const dateTo = request.input('date_to') as string | undefined

    const query = AuditLog.query().orderBy('created_at', 'desc')

    if (actorType) query.where('actor_type', actorType)
    if (actorId) query.where('actor_id', Number(actorId))
    if (resourceType) query.where('resource_type', resourceType)
    if (resourceId) query.where('resource_id', resourceId)
    if (action) query.where('action', 'ilike', `%${action}%`)

    if (dateFrom) {
      const from = DateTime.fromISO(dateFrom)
      if (!from.isValid) return response.badRequest({ message: 'Invalid date_from' })
      query.where('created_at', '>=', from.toSQL()!)
    }
    if (dateTo) {
      const to = DateTime.fromISO(dateTo)
      if (!to.isValid) return response.badRequest({ message: 'Invalid date_to' })
      query.where('created_at', '<=', to.toSQL()!)
    }

    const paginated = await query.paginate(page, limit)

    return response.ok({
      data: paginated.all().map((log) => ({
        id: log.id,
        actor_type: log.actorType,
        actor_id: log.actorId,
        action: log.action,
        resource_type: log.resourceType,
        resource_id: log.resourceId,
        ip_address: log.ipAddress,
        correlation_id: log.correlationId,
        created_at: log.createdAt,
      })),
      meta: {
        total: paginated.total,
        page: paginated.currentPage,
        limit,
        last_page: paginated.lastPage,
      },
    })
  }

  /** GET /api/v1/admin/audit-logs/:id — includes the before/after diff (omitted from index for size). */
  async show({ params, response }: HttpContext) {
    const log = await AuditLog.findOrFail(params.id)

    return response.ok({
      data: {
        id: log.id,
        actor_type: log.actorType,
        actor_id: log.actorId,
        action: log.action,
        resource_type: log.resourceType,
        resource_id: log.resourceId,
        before: log.before,
        after: log.after,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        device_id: log.deviceId,
        correlation_id: log.correlationId,
        created_at: log.createdAt,
      },
    })
  }
}
