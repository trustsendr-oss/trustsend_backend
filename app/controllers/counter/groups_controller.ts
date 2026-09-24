import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import BorrowerGroup from '#models/borrower_group'
import User from '#models/user'
import { GroupLendingService } from '#services/lending/group_lending_service'

const createGroupValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    /** Optional code identifying this group in the institution's own system */
    external_reference: vine.string().trim().maxLength(80).optional(),
  })
)

const addMemberValidator = vine.compile(
  vine.object({
    user_id: vine.number().positive(),
    role: vine.enum(['leader', 'officer', 'member'] as const).optional(),
  })
)

/**
 * Borrower groups — solidarity lending circles.
 *
 * A group is always scoped to the institution (`business`). The controller only exposes the
 * structural side (create, list, add/remove members, summary). The lending side (associating a
 * group loan with a group) happens through the standard loan request flow with a `group_id`.
 */
export default class GroupsController {
  /** GET /api/v1/counter/groups */
  async index({ business, response }: HttpContext) {
    const groups = await BorrowerGroup.query()
      .where('provider_id', business.id)
      .preload('members', (q) => q.preload('user'))
      .orderBy('created_at', 'desc')
      .limit(200)

    return response.ok({
      data: groups.map((g) => this.serialize(g)),
    })
  }

  /** GET /api/v1/counter/groups/:id */
  async show({ business, params, response }: HttpContext) {
    const group = await this.owned(business.id, params.id)
    if (!group) return response.notFound({ message: 'Group not found' })

    const summary = await GroupLendingService.getGroupFinancialSummary(group)
    return response.ok({ data: { ...this.serialize(group), summary } })
  }

  /** POST /api/v1/counter/groups */
  async store({ business, businessStaff, request, correlationId, response }: HttpContext) {
    const { name, external_reference } = await request.validateUsing(createGroupValidator)

    const group = await GroupLendingService.createGroup(
      business.id,
      businessStaff.id,
      name,
      correlationId,
      external_reference
    )

    return response.created({ data: this.serialize(group) })
  }

  /** POST /api/v1/counter/groups/:id/members */
  async addMember({ business, params, request, response }: HttpContext) {
    const { user_id, role } = await request.validateUsing(addMemberValidator)

    const group = await this.owned(business.id, params.id)
    if (!group) return response.notFound({ message: 'Group not found' })

    const user = await User.find(user_id)
    if (!user) return response.notFound({ message: 'User not found' })

    try {
      await GroupLendingService.addMember(group, user, role)
      await group.load('members', (q) => q.preload('user'))
      return response.ok({ data: this.serialize(group) })
    } catch (error) {
      const err = error as Error
      return response.conflict({ message: err.message, code: 'E_GROUP_MEMBERSHIP' })
    }
  }

  /** DELETE /api/v1/counter/groups/:id/members/:userId */
  async removeMember({ business, params, response }: HttpContext) {
    const group = await this.owned(business.id, params.id)
    if (!group) return response.notFound({ message: 'Group not found' })

    try {
      await GroupLendingService.removeMember(group, Number(params.userId))
      await group.load('members', (q) => q.preload('user'))
      return response.ok({ data: this.serialize(group) })
    } catch (error) {
      const err = error as Error
      return response.conflict({ message: err.message, code: 'E_GROUP_MEMBERSHIP' })
    }
  }

  /** GET /api/v1/counter/groups/:id/summary — financial health of the group */
  async summary({ business, params, response }: HttpContext) {
    const group = await this.owned(business.id, params.id)
    if (!group) return response.notFound({ message: 'Group not found' })

    const summary = await GroupLendingService.getGroupFinancialSummary(group)
    return response.ok({ data: summary })
  }

  private owned(businessId: number, id: string) {
    return BorrowerGroup.query()
      .where('id', Number(id))
      .where('provider_id', businessId)
      .preload('members', (q) => q.preload('user'))
      .first()
  }

  private serialize(group: BorrowerGroup) {
    return {
      id: group.id,
      name: group.name,
      external_reference: group.externalReference,
      status: group.status,
      member_count: group.members?.length ?? 0,
      members: group.members?.map((m) => ({
        id: m.id,
        user_id: m.userId,
        role: m.role,
        status: m.status,
        full_name: m.user?.fullName,
        joined_at: m.joinedAt,
      })),
      created_at: group.createdAt,
    }
  }
}
