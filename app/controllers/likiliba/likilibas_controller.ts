import type { HttpContext } from '@adonisjs/core/http'
import Likiliba from '#models/likiliba'
import LikilibaMember from '#models/likiliba_member'
import type User from '#models/user'
import {
  acceptLinkValidator,
  cancelValidator,
  commitValidator,
  createLikilibaValidator,
  inviteValidator,
  listValidator,
  lockValidator,
  mandateValidator,
  moneyActionValidator,
  pinValidator,
  updateLikilibaValidator,
} from '#validators/likiliba'
import { LikilibaService, drawOrder, membersOf } from '#services/likiliba/likiliba_service'
import { LikilibaInvitationService } from '#services/likiliba/invitation_service'
import { LikilibaMembershipService } from '#services/likiliba/membership_service'
import { LikilibaContributionService } from '#services/likiliba/contribution_service'
import { LikilibaDebtService } from '#services/likiliba/debt_service'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaPresenter } from '#services/likiliba/presenter'
import { LikilibaException, sha256 } from '#services/likiliba/shared'
import {
  assertPin,
  idempotent,
  likilibaError,
  parseDate,
} from '#controllers/likiliba/likiliba_http'

/**
 * Likiliba — private rotating savings groups, from the member's side.
 *
 * Every action that moves money or binds a member (signing the rules, contributing, repaying,
 * starting, cancelling, leaving, the debit mandate) requires the PIN. Money-moving ones are also
 * idempotent on `idempotency_key`. Only members see a group; invitees see it through their
 * invitation, rules included.
 */
export default class LikilibasController {
  /** GET /likilibas — the groups I belong to or organise. */
  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const memberships = await LikilibaMember.query()
      .where('userId', user.id)
      .whereNotIn('status', ['left', 'removed'])
      .preload('likiliba')
      .orderBy('createdAt', 'desc')
    const data = []
    for (const m of memberships) {
      data.push({
        ...(await LikilibaPresenter.summary(m.likiliba)),
        my_role: m.role,
        my_status: m.status,
        my_position: m.position,
      })
    }
    return response.ok({ data })
  }

  /** POST /likilibas */
  async store({ auth, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(createLikilibaValidator)
    try {
      const likiliba = await LikilibaService.create(
        user,
        {
          name: p.name,
          description: p.description,
          currencyCode: p.currency_code,
          contributionAmount: BigInt(p.contribution_amount),
          frequency: p.frequency,
          size: p.size,
          startsAt: parseDate(p.starts_at, 'starts_at'),
          cautionRequired: p.caution_required,
          cautionMultiplier: p.caution_multiplier,
          graceHours: p.grace_hours,
          escalationDays: p.escalation_days,
          penaltyMode: p.penalty_mode,
          penaltyFixedAmount: p.penalty_fixed_amount ? BigInt(p.penalty_fixed_amount) : null,
          penaltyDailyBps: p.penalty_daily_bps,
          penaltyCapBps: p.penalty_cap_bps,
          orderingMode: p.ordering_mode,
        },
        correlationId
      )
      return response.created({ data: await LikilibaPresenter.detail(likiliba, user.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/:id */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const likiliba = await this.visible(params.id, user)
      return response.ok({ data: await LikilibaPresenter.detail(likiliba, user.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** PATCH /likilibas/:id — organiser, before locking. */
  async update({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(updateLikilibaValidator)
    try {
      const likiliba = await LikilibaService.update(
        user,
        Number(params.id),
        {
          ...(p.name !== undefined && { name: p.name }),
          ...(p.description !== undefined && { description: p.description }),
          ...(p.contribution_amount && { contributionAmount: BigInt(p.contribution_amount) }),
          ...(p.frequency && { frequency: p.frequency }),
          ...(p.size && { size: p.size }),
          ...(p.starts_at && { startsAt: parseDate(p.starts_at, 'starts_at') }),
          ...(p.caution_required !== undefined && { cautionRequired: p.caution_required }),
          ...(p.caution_multiplier !== undefined && { cautionMultiplier: p.caution_multiplier }),
          ...(p.grace_hours !== undefined && { graceHours: p.grace_hours }),
          ...(p.escalation_days !== undefined && { escalationDays: p.escalation_days }),
          ...(p.penalty_mode && { penaltyMode: p.penalty_mode }),
          ...(p.penalty_fixed_amount && { penaltyFixedAmount: BigInt(p.penalty_fixed_amount) }),
          ...(p.penalty_daily_bps !== undefined && { penaltyDailyBps: p.penalty_daily_bps }),
          ...(p.penalty_cap_bps !== undefined && { penaltyCapBps: p.penalty_cap_bps }),
          ...(p.ordering_mode && { orderingMode: p.ordering_mode }),
        },
        correlationId
      )
      return response.ok({ data: await LikilibaPresenter.detail(likiliba, user.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/:id/rules — the current version, in plain French, with its hash to sign. */
  async rules({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const likiliba = await this.visible(params.id, user)
      return response.ok({ data: await LikilibaPresenter.rules(likiliba) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/:id/history — every action on the group, newest first. */
  async history({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const q = await request.validateUsing(listValidator, { data: request.qs() })
    try {
      const likiliba = await this.visible(params.id, user)
      return response.ok(await LikilibaPresenter.history(likiliba, q.page ?? 1, q.limit ?? 50))
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/:id/penalties?mine=true — the detailed penalty list. */
  async penalties({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const q = await request.validateUsing(listValidator, { data: request.qs() })
    try {
      const likiliba = await this.visible(params.id, user)
      const member = q.mine ? await LikilibaService.memberOf(likiliba, user.id) : null
      const entries = await LikilibaPenaltyService.listFor(likiliba, member?.id)
      const rows = LikilibaPresenter.penalties(entries)
      return response.ok({
        data: rows,
        meta: {
          total: rows.length,
          total_amount: entries.reduce((s, e) => s + e.penalty.amount, 0n).toString(),
          paid_amount: entries
            .filter((e) => e.penalty.status === 'paid')
            .reduce((s, e) => s + e.penalty.amount, 0n)
            .toString(),
          owed_amount: entries
            .filter((e) => e.penalty.status === 'in_debt')
            .reduce((s, e) => s + e.penalty.amount, 0n)
            .toString(),
          daily_amount: LikilibaPenaltyService.dailyAmount(likiliba).toString(),
          cap_per_contribution: LikilibaPenaltyService.capAmount(likiliba).toString(),
        },
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/:id/me — my contributions and debts in this group. */
  async mine({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const likiliba = await this.visible(params.id, user)
      const member = await LikilibaService.memberOf(likiliba, user.id)
      return response.ok({ data: await LikilibaPresenter.mine(likiliba, member.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /**
   * GET /likilibas/:id/draw — everything needed to check the draw by hand: the seed, its hash
   * published at lock time, and each member's digest.
   */
  async draw({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const likiliba = await this.visible(params.id, user)
      if (likiliba.orderingMode !== 'draw') {
        return response.ok({ data: { mode: 'manual' } })
      }
      const revealed = !!likiliba.startedAt && !!likiliba.drawSeed
      const members = await membersOf(likiliba)
      return response.ok({
        data: {
          mode: 'draw',
          seed_hash: likiliba.drawSeedHash,
          seed: revealed ? likiliba.drawSeed : null,
          seed_matches_hash: revealed ? sha256(likiliba.drawSeed!) === likiliba.drawSeedHash : null,
          method: 'Each member is ranked by SHA-256("<seed>:<member_id>"), ascending.',
          order: revealed
            ? drawOrder(
                likiliba.drawSeed!,
                members.map((m) => m.id)
              ).map((id, i) => ({
                position: i + 1,
                member_id: id,
                digest: sha256(`${likiliba.drawSeed}:${id}`),
              }))
            : null,
        },
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /* ------------------------------ Invitations ----------------------------- */

  /** POST /likilibas/:id/invitations — by account code, phone number, or a link. */
  async invite({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(inviteValidator)
    try {
      const target =
        p.channel === 'account'
          ? { channel: 'account' as const, userCode: p.user_code! }
          : p.channel === 'phone'
            ? { channel: 'phone' as const, phone: p.phone! }
            : { channel: 'link' as const }
      const { invitation, token } = await LikilibaInvitationService.invite(
        user,
        Number(params.id),
        target,
        correlationId
      )
      return response.created({
        data: {
          ...LikilibaPresenter.invitation(invitation),
          // Shown once: only its hash is stored.
          token,
        },
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** GET /likilibas/invitations — every open invitation addressed to me, across groups. */
  async invitations({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const invitations = await LikilibaInvitationService.listFor(user)
    const data = []
    for (const invitation of invitations)
      data.push(await LikilibaPresenter.invitationForInvitee(invitation))
    return response.ok({ data })
  }

  async acceptInvitation({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const invitation = await LikilibaInvitationService.accept(
        user,
        Number(params.invitationId),
        correlationId
      )
      return response.ok({ data: { id: invitation.id, status: invitation.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async acceptLink({ auth, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const { token } = await request.validateUsing(acceptLinkValidator)
    try {
      const invitation = await LikilibaInvitationService.acceptLink(user, token, correlationId)
      return response.ok({
        data: { id: invitation.id, likiliba_id: invitation.likilibaId, status: invitation.status },
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async declineInvitation({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const invitation = await LikilibaInvitationService.decline(
        user,
        Number(params.invitationId),
        correlationId
      )
      return response.ok({ data: { id: invitation.id, status: invitation.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async admitInvitation({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const invitation = await LikilibaInvitationService.admit(
        user,
        Number(params.invitationId),
        correlationId
      )
      return response.ok({ data: { id: invitation.id, status: invitation.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async rejectInvitation({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const invitation = await LikilibaInvitationService.reject(
        user,
        Number(params.invitationId),
        correlationId
      )
      return response.ok({ data: { id: invitation.id, status: invitation.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async revokeInvitation({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      const invitation = await LikilibaInvitationService.revoke(
        user,
        Number(params.invitationId),
        correlationId
      )
      return response.ok({ data: { id: invitation.id, status: invitation.status } })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** DELETE /likilibas/:id/members/:memberId — organiser, before locking. */
  async removeMember({ auth, params, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    try {
      await LikilibaService.removeMember(
        user,
        Number(params.id),
        Number(params.memberId),
        correlationId
      )
      return response.noContent()
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /* ------------------------------- Lifecycle ------------------------------ */

  async lock({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(lockValidator)
    try {
      await assertPin(user, p.pin)
      const likiliba = await LikilibaService.lock(user, Number(params.id), p.order, correlationId)
      return response.ok({ data: await LikilibaPresenter.detail(likiliba, user.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** POST /likilibas/:id/commit — sign the final rules; locks the caution if one is required. */
  async commit(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail() as User
    const p = await ctx.request.validateUsing(commitValidator)
    return idempotent(
      ctx,
      user,
      `POST /api/v1/likilibas/${ctx.params.id}/commit`,
      p,
      200,
      async () => {
        await assertPin(user, p.pin)
        const member = await LikilibaMembershipService.commit(
          user,
          Number(ctx.params.id),
          { rulesHash: p.rules_hash, autoDebit: p.auto_debit, idempotencyKey: p.idempotency_key },
          ctx.correlationId
        )
        return {
          data: { member_id: member.id, status: member.status, auto_debit: member.autoDebit },
        }
      }
    )
  }

  async start({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(pinValidator)
    try {
      await assertPin(user, p.pin)
      const likiliba = await LikilibaService.start(user, Number(params.id), correlationId)
      return response.ok({ data: await LikilibaPresenter.detail(likiliba, user.id) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async cancel({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(cancelValidator)
    try {
      await assertPin(user, p.pin)
      const likiliba = await LikilibaService.cancel(
        user,
        Number(params.id),
        p.reason,
        correlationId
      )
      return response.ok({ data: await LikilibaPresenter.summary(likiliba) })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  async leave({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(pinValidator)
    try {
      await assertPin(user, p.pin)
      await LikilibaService.leave(user, Number(params.id), correlationId)
      return response.noContent()
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /* --------------------------------- Money -------------------------------- */

  /** POST /likilibas/:id/contributions — pay my share of the open round. */
  async contribute(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail() as User
    const p = await ctx.request.validateUsing(moneyActionValidator)
    return idempotent(
      ctx,
      user,
      `POST /api/v1/likilibas/${ctx.params.id}/contributions`,
      p,
      201,
      async () => {
        await assertPin(user, p.pin)
        const c = await LikilibaContributionService.pay(
          user,
          Number(ctx.params.id),
          ctx.correlationId,
          p.idempotency_key
        )
        return {
          data: {
            reference: c.reference,
            status: c.status,
            amount: c.amount.toString(),
            fee: '0',
            ledger_transaction_id: c.ledgerTransactionId,
            confirmed_at: c.confirmedAt,
          },
        }
      }
    )
  }

  /** POST /likilibas/:id/debts/repay — repay everything I owe in the group. */
  async repay(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail() as User
    const p = await ctx.request.validateUsing(moneyActionValidator)
    return idempotent(
      ctx,
      user,
      `POST /api/v1/likilibas/${ctx.params.id}/debts/repay`,
      p,
      200,
      async () => {
        await assertPin(user, p.pin)
        const result = await LikilibaDebtService.repay(
          user,
          Number(ctx.params.id),
          ctx.correlationId,
          p.idempotency_key
        )
        return {
          data: { amount: result.amount.toString(), ledger_transaction_id: result.transactionId },
        }
      }
    )
  }

  /** PUT /likilibas/:id/mandate — grant or revoke the automatic debit. */
  async mandate({ auth, params, request, response, correlationId }: HttpContext) {
    const user = auth.getUserOrFail() as User
    const p = await request.validateUsing(mandateValidator)
    try {
      await assertPin(user, p.pin)
      const member = await LikilibaMembershipService.setMandate(
        user,
        Number(params.id),
        p.enabled,
        correlationId
      )
      return response.ok({
        data: {
          auto_debit: member.autoDebit,
          granted_at: member.mandateGrantedAt,
          revoked_at: member.mandateRevokedAt,
        },
      })
    } catch (error) {
      return likilibaError(error, response)
    }
  }

  /** A group is visible to its members only — anyone else gets the same 404 as a missing group. */
  private async visible(id: string | number, user: User): Promise<Likiliba> {
    const likiliba = await Likiliba.find(Number(id))
    if (!likiliba) throw new LikilibaException('This likiliba does not exist', 'NOT_FOUND', 404)
    const member = await LikilibaMember.query()
      .where('likilibaId', likiliba.id)
      .where('userId', user.id)
      .first()
    if (!member) throw new LikilibaException('This likiliba does not exist', 'NOT_FOUND', 404)
    return likiliba
  }
}
