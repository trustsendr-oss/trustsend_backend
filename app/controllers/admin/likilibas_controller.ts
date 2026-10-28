import type { HttpContext } from '@adonisjs/core/http'
import Likiliba from '#models/likiliba'
import type InternalUser from '#models/internal_user'
import { listValidator, noteValidator, reasonValidator } from '#validators/likiliba'
import { LikilibaPresenter } from '#services/likiliba/presenter'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaAdminService } from '#services/likiliba/admin_service'
import { LikilibaChatService } from '#services/likiliba/chat_service'
import LikilibaMessage from '#models/likiliba_message'
import LikilibaMessageReport from '#models/likiliba_message_report'
import { displayName } from '#services/likiliba/likiliba_service'
import { LikilibaException } from '#services/likiliba/shared'
import { likilibaError, serveAttachment } from '#controllers/likiliba/likiliba_http'

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

  /**
   * GET /admin/likilibas/:id/messages — the whole conversation as written, deleted and hidden
   * messages included, with the reports on each. Reported ones first.
   */
  async messages({ params, response }: HttpContext) {
    try {
      const likiliba = await this.find(params.id)
      const messages = await LikilibaMessage.query()
        .where('likilibaId', likiliba.id)
        .preload('member', (q) => q.preload('user'))
        .orderBy('createdAt', 'desc')
        .limit(500)
      const reports = await LikilibaMessageReport.query().whereIn(
        'messageId',
        messages.map((m) => m.id)
      )
      const data = messages.map((m) => {
        const own = reports.filter((r) => r.messageId === m.id)
        return {
          id: m.id,
          author: {
            member_id: m.memberId,
            name: displayName(m.member.user),
            user_id: m.member.userId,
          },
          kind: m.kind,
          body: m.body,
          // Support sees what was sent even once deleted or hidden — that is what it moderates.
          attachment: m.attachmentRef
            ? {
                url: `/api/v1/admin/likilibas/messages/${m.id}/attachment`,
                name: m.attachmentName,
                mime_type: m.attachmentMimeType,
                size: m.attachmentSize,
              }
            : null,
          created_at: m.createdAt,
          deleted_at: m.deletedAt,
          hidden_at: m.hiddenAt,
          hide_reason: m.hideReason,
          reports: own.map((r) => ({
            id: r.id,
            reason: r.reason,
            created_at: r.createdAt,
            resolved_at: r.resolvedAt,
          })),
          open_reports: own.filter((r) => !r.resolvedAt).length,
        }
      })
      data.sort((a, b) => b.open_reports - a.open_reports)
      return response.ok({ data })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** POST /admin/likilibas/messages/:messageId/hide — removes a message from every member's view. */
  async hideMessage({ auth, params, request, response, correlationId }: HttpContext) {
    const staff = auth.getUserOrFail() as InternalUser
    const { reason } = await request.validateUsing(reasonValidator)
    try {
      const message = await LikilibaChatService.hide(
        staff.id,
        Number(params.messageId),
        reason,
        correlationId
      )
      return response.ok({ data: { id: message.id, hidden_at: message.hiddenAt } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /admin/likilibas/messages/:messageId/attachment — deleted or hidden ones included. */
  async messageAttachment({ params, response }: HttpContext) {
    try {
      const message = await LikilibaMessage.find(Number(params.messageId))
      if (!message?.attachmentRef) {
        throw new LikilibaException('This message has no file', 'NOT_FOUND', 404)
      }
      return serveAttachment(response, message)
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
