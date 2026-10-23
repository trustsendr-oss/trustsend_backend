import db from '@adonisjs/lucid/services/db'
import type Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaEvent from '#models/likiliba_event'
import LikilibaInvitation from '#models/likiliba_invitation'
import type LikilibaPenalty from '#models/likiliba_penalty'
import LikilibaRound from '#models/likiliba_round'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaRules } from '#services/likiliba/rules'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaDebtService } from '#services/likiliba/debt_service'
import { displayName, membersOf } from '#services/likiliba/likiliba_service'
import { bpsOf } from '#services/likiliba/shared'

const str = (v: bigint | null | undefined) => (v === null || v === undefined ? null : v.toString())

/**
 * What members see of their group. Amounts are strings in minor units, like every other endpoint.
 * Other members appear by name, code and status only — never their phone, e-mail or balances.
 */
export class LikilibaPresenter {
  static async summary(likiliba: Likiliba) {
    const rules = await LikilibaRules.current(likiliba)
    const commissionBps = rules ? LikilibaRules.commissionBpsOf(rules) : 0
    const gross = likiliba.roundAmount
    const commission = bpsOf(gross, commissionBps)
    const started = !!likiliba.startedAt
    return {
      id: likiliba.id,
      code: likiliba.code,
      name: likiliba.name,
      description: likiliba.description,
      status: likiliba.status,
      currency_code: likiliba.currencyCode,
      contribution_amount: str(likiliba.contributionAmount),
      size: likiliba.size,
      frequency: likiliba.frequency,
      starts_at: likiliba.startsAt,
      round_gross_amount: str(gross),
      commission_bps: commissionBps,
      round_commission_amount: str(commission),
      round_net_amount: str(gross - commission),
      caution: {
        required: likiliba.cautionRequired,
        multiplier: likiliba.cautionMultiplier,
        amount: str(likiliba.cautionAmount),
      },
      grace_hours: likiliba.graceHours,
      escalation_days: likiliba.escalationDays,
      penalty: {
        mode: likiliba.penaltyMode,
        daily_amount: str(LikilibaPenaltyService.dailyAmount(likiliba)),
        daily_bps: likiliba.penaltyDailyBps,
        cap_bps: likiliba.penaltyCapBps,
        cap_amount: str(LikilibaPenaltyService.capAmount(likiliba)),
        paid_to: 'round_beneficiary',
      },
      ordering: {
        mode: likiliba.orderingMode,
        draw_seed_hash: likiliba.drawSeedHash,
        draw_seed: started ? likiliba.drawSeed : null,
      },
      current_round: likiliba.currentRoundNumber || null,
      organiser_user_id: likiliba.creatorUserId,
      locked_at: likiliba.lockedAt,
      started_at: likiliba.startedAt,
      completed_at: likiliba.completedAt,
      cancelled_at: likiliba.cancelledAt,
      cancel_reason: likiliba.cancelReason,
      suspended_at: likiliba.suspendedAt,
      suspension_reason: likiliba.suspensionReason,
    }
  }

  static async rules(likiliba: Likiliba) {
    const rules = await LikilibaRules.current(likiliba)
    return rules
      ? {
          version: rules.version,
          hash: rules.rulesHash,
          clauses: rules.rules.clauses,
          terms: rules.rules.terms,
          created_at: rules.createdAt,
        }
      : null
  }

  static async detail(likiliba: Likiliba, viewerUserId: number) {
    const members = await membersOf(likiliba)
    const me = members.find((m) => m.userId === viewerUserId) ?? null
    const rounds = await LikilibaRound.query()
      .where('likilibaId', likiliba.id)
      .preload('beneficiary', (q) => q.preload('user'))
      .orderBy('number', 'asc')
    const current = rounds.find((r) => r.number === likiliba.currentRoundNumber) ?? null
    const contributions = current
      ? await LikilibaContribution.query().where('roundId', current.id)
      : []
    const byMember = new Map(contributions.map((c) => [c.memberId, c]))

    const pot = likiliba.potWalletId ? await LikilibaLedger.balanceOf(likiliba.potWalletId) : 0n
    const commissions = rounds.reduce((s, r) => s + (r.commissionAmount ?? 0n), 0n)
    const myContribution = me ? byMember.get(me.id) : undefined

    const data: Record<string, any> = {
      ...(await this.summary(likiliba)),
      rules: await this.rules(likiliba),
      members: members.map((m) => ({
        member_id: m.id,
        name: displayName(m.user),
        code: m.user.code,
        role: m.role,
        position: m.position,
        status: m.status,
        signed: m.status !== 'admitted',
        has_received: !!m.paidOutAt,
        current_contribution_status: byMember.get(m.id)?.status ?? null,
      })),
      rounds: rounds.map((r) => ({
        number: r.number,
        beneficiary: { member_id: r.beneficiaryMemberId, name: displayName(r.beneficiary.user) },
        due_at: r.dueAt,
        grace_ends_at: r.graceEndsAt,
        status: r.status,
        gross_amount: str(r.grossAmount),
        commission_amount: str(r.commissionAmount),
        withheld_amount: str(r.withheldAmount),
        net_amount: str(r.netAmount),
        payout_transaction_id: r.payoutTransactionId,
        paid_out_at: r.paidOutAt,
      })),
      pot: {
        balance: str(pot),
        collected: str(
          contributions
            .filter((c) => c.status === 'confirmed' || c.status === 'covered')
            .reduce((s, c) => s + c.amount, 0n)
        ),
        expected: str(likiliba.roundAmount),
        confirmed_count: contributions.filter((c) => c.status === 'confirmed').length,
        covered_count: contributions.filter((c) => c.status === 'covered').length,
        missing_count: contributions.filter((c) => c.status === 'pending' || c.status === 'late')
          .length,
      },
      commissions_total: str(commissions),
      me: me
        ? {
            member_id: me.id,
            role: me.role,
            status: me.status,
            position: me.position,
            auto_debit: me.autoDebit,
            rules_signed_version_id: me.acceptedRuleVersionId,
            caution_balance: me.cautionWalletId
              ? str(await LikilibaLedger.balanceOf(me.cautionWalletId))
              : null,
            debts_total: str(await LikilibaDebtService.totalOwedBy(me.id)),
            current_contribution: myContribution
              ? {
                  reference: myContribution.reference,
                  status: myContribution.status,
                  amount: str(myContribution.amount),
                }
              : null,
          }
        : null,
    }

    if (viewerUserId === likiliba.creatorUserId) {
      const invitations = await LikilibaInvitation.query()
        .where('likilibaId', likiliba.id)
        .orderBy('createdAt', 'desc')
        .preload('invitee')
      data.invitations = invitations.map((i) => this.invitation(i))
    }
    return data
  }

  static invitation(i: LikilibaInvitation) {
    return {
      id: i.id,
      channel: i.channel,
      status: i.status,
      invitee: i.invitee
        ? { user_id: i.invitee.id, name: displayName(i.invitee), code: i.invitee.code }
        : null,
      invitee_phone: i.inviteePhone,
      expires_at: i.expiresAt,
      responded_at: i.respondedAt,
      decided_at: i.decidedAt,
      created_at: i.createdAt,
    }
  }

  /** An invitation as its recipient sees it: enough to decide, rules included. */
  static async invitationForInvitee(i: LikilibaInvitation) {
    return {
      id: i.id,
      status: i.status,
      expires_at: i.expiresAt,
      invited_by: { name: displayName(i.invitedBy), code: i.invitedBy.code },
      likiliba: await this.summary(i.likiliba),
      rules: await this.rules(i.likiliba),
    }
  }

  static penalties(entries: Array<{ penalty: LikilibaPenalty; cumulative: bigint; cap: bigint }>) {
    return entries.map(({ penalty: p, cumulative, cap }) => ({
      id: p.id,
      reference: p.reference,
      member: { member_id: p.memberId, name: displayName(p.member.user) },
      beneficiary: { member_id: p.beneficiaryMemberId, name: displayName(p.beneficiary.user) },
      round: p.contribution.round.number,
      contribution_reference: p.contribution.reference,
      contribution_amount: str(p.contribution.amount),
      day_number: p.dayNumber,
      basis: p.basis,
      amount: str(p.amount),
      cumulative_on_contribution: str(cumulative),
      cap_on_contribution: str(cap),
      reason:
        p.contribution.status === 'covered'
          ? 'Avance des cautions non remboursée'
          : p.contribution.status === 'confirmed'
            ? 'Cotisation payée en retard'
            : 'Cotisation non payée',
      status: p.status,
      ledger_transaction_id: p.ledgerTransactionId,
      grace_ended_at: p.contribution.round.graceEndsAt,
      assessed_at: p.assessedAt,
      settled_at: p.settledAt,
      waive_reason: p.waiveReason,
    }))
  }

  static async history(likiliba: Likiliba, page: number, limit: number) {
    const result = await LikilibaEvent.query()
      .where('likilibaId', likiliba.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, limit)
    return {
      data: result.all().map((e) => ({
        id: e.id,
        event_type: e.eventType,
        actor_type: e.actorType,
        member_id: e.memberId,
        payload: e.payload,
        created_at: e.createdAt,
      })),
      meta: { total: result.total, page, limit },
    }
  }

  /** The viewer's own contributions and debts across the cycle. */
  static async mine(likiliba: Likiliba, memberId: number) {
    const contributions = await LikilibaContribution.query()
      .where('likilibaId', likiliba.id)
      .where('memberId', memberId)
      .preload('round')
      .orderBy('id', 'asc')
    const debts = await db
      .from('likiliba_debts as d')
      .join('likiliba_members as m', 'm.id', 'd.creditor_member_id')
      .join('users as u', 'u.id', 'm.user_id')
      .where('d.debtor_member_id', memberId)
      .orderBy('d.id', 'asc')
      .select('d.*', 'u.full_name as creditor_name')
    return {
      contributions: contributions.map((c) => ({
        reference: c.reference,
        round: c.round.number,
        due_at: c.round.dueAt,
        grace_ends_at: c.round.graceEndsAt,
        amount: str(c.amount),
        status: c.status,
        paid_via: c.paidVia,
        attempts: c.attempts,
        last_failure_reason: c.lastFailureReason,
        ledger_transaction_id: c.ledgerTransactionId,
        confirmed_at: c.confirmedAt,
        covered_at: c.coveredAt,
      })),
      debts: debts.map((d: any) => ({
        id: d.id,
        origin: d.origin,
        creditor: {
          member_id: d.creditor_member_id,
          name: d.creditor_member_id === memberId ? 'Votre propre caution' : d.creditor_name,
        },
        amount: String(d.amount),
        remaining: String(d.remaining),
        status: d.status,
        created_at: d.created_at,
        settled_at: d.settled_at,
      })),
    }
  }
}
