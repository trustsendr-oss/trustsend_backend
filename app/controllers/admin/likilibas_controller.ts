import type { HttpContext } from '@adonisjs/core/http'
import Likiliba from '#models/likiliba'
import type InternalUser from '#models/internal_user'
import { listValidator, noteValidator, reasonValidator } from '#validators/likiliba'
import { LikilibaPresenter } from '#services/likiliba/presenter'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaAdminService } from '#services/likiliba/admin_service'
import { LikilibaException } from '#services/likiliba/shared'
import { likilibaError } from '#controllers/likiliba/likiliba_http'

/**
 * Reemite oversight of likiliba groups — internal_user only. Support reads everything, can
 * suspend and resume a group and waive a penalty still owed; it cannot move a group's money.
 */
export default class AdminLikilibasController {
  /** GET /admin/likilibas?status=suspended */
  async index({ request, response }: HttpContext) {
    const q = await request.validateUsing(listValidator, { data: request.qs() })
    const page = q.page ?? 1
    const limit = q.limit ?? 25
    const query = Likiliba.query().orderBy('updatedAt', 'desc')
    if (q.status) query.where('status', q.status)
    const result = await query.paginate(page, limit)
    const data = []
    for (const likiliba of result.all()) data.push(await LikilibaPresenter.summary(likiliba))
    return response.ok({ data, meta: { total: result.total, page, limit } })
  }

  async show({ params, response }: HttpContext) {
    try {
      const likiliba = await this.find(params.id)
      // The organiser's view is the most complete one, invitations included.
      return response.ok({ data: await LikilibaPresenter.detail(likiliba, likiliba.creatorUserId) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async history({ params, request, response }: HttpContext) {
    const q = await request.validateUsing(listValidator, { data: request.qs() })
    try {
      const likiliba = await this.find(params.id)
      return response.ok(await LikilibaPresenter.history(likiliba, q.page ?? 1, q.limit ?? 100))
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async penalties({ params, response }: HttpContext) {
    try {
      const likiliba = await this.find(params.id)
      return response.ok({
        data: LikilibaPresenter.penalties(await LikilibaPenaltyService.listFor(likiliba)),
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async suspend({ auth, params, request, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)
    try {
      const likiliba = await LikilibaAdminService.suspend(
        staff.id,
        Number(params.id),
        reason,
        correlationId
      )
      return response.ok({ data: await LikilibaPresenter.summary(likiliba) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async resume({ auth, params, request, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const { note } = await request.validateUsing(noteValidator)
    try {
      const likiliba = await LikilibaAdminService.resume(
        staff.id,
        Number(params.id),
        note,
        correlationId
      )
      return response.ok({ data: await LikilibaPresenter.summary(likiliba) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** POST /admin/likilibas/penalties/:penaltyId/waive */
  async waivePenalty({ auth, params, request, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)
    try {
      const penalty = await LikilibaPenaltyService.waive(
        staff.id,
        Number(params.penaltyId),
        reason,
        correlationId
      )
      return response.ok({ data: { reference: penalty.reference, status: penalty.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  private async find(id: string | number) {
    const likiliba = await Likiliba.find(Number(id))
    if (!likiliba) throw new LikilibaException('This likiliba does not exist', 'NOT_FOUND', 404)
    return likiliba
  }
}
