import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Likiliba from '#models/likiliba'
import type { LikilibaFrequency, LikilibaOrderingMode, LikilibaPenaltyMode } from '#models/likiliba'
import LikilibaInvitation from '#models/likiliba_invitation'
import LikilibaMember from '#models/likiliba_member'
import LikilibaRound from '#models/likiliba_round'
import User from '#models/user'
import likilibaConfig, { LIKILIBA_CURRENCIES, type LikilibaCurrency } from '#config/likiliba'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { UserOnboardingService } from '#services/users/user_onboarding_service'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { LikilibaRules, type RosterEntry } from '#services/likiliba/rules'
import {
  dueDateOf,
  formatDate,
  isKycApproved,
  LikilibaException,
  lockGroup,
  newReference,
  percentToBps,
  sha256,
  type LikilibaActor,
} from '#services/likiliba/shared'

export type LikilibaSettings = {
  name: string
  description?: string | null
  currencyCode: string
  contributionAmount: bigint
  frequency: LikilibaFrequency
  size: number
  startsAt: DateTime
  cautionRequired: boolean
  cautionMultiplier?: number | null
  graceHours?: number
  escalationDays?: number
  penaltyMode: LikilibaPenaltyMode
  penaltyFixedAmount?: bigint | null
  penaltyDailyBps?: number | null
  penaltyCapBps?: number | null
  orderingMode: LikilibaOrderingMode
}

/** Members still in the group, with their user loaded. */
export async function membersOf(likiliba: Likiliba, trx?: TransactionClientContract) {
  return LikilibaMember.query(trx ? { client: trx } : {})
    .where('likilibaId', likiliba.id)
    .whereNotIn('status', ['left', 'removed'])
    .preload('user')
    .orderByRaw('position ASC NULLS LAST, id ASC')
}

export function displayName(user: User): string {
  return user.fullName || user.code || `#${user.id}`
}

/**
 * The life of a group before and around its cycle: creation, the rules, locking the roster,
 * starting, cancelling, members leaving. Money moved here is limited to cautions — locked when a
 * member signs, refunded when the cycle never starts.
 */
export class LikilibaService {
  /* ------------------------------- Creation ------------------------------- */

  static validateSettings(s: LikilibaSettings, now = DateTime.now()) {
    if (!(LIKILIBA_CURRENCIES as readonly string[]).includes(s.currencyCode)) {
      throw new LikilibaException('A likiliba is held in CDF or USD only', 'CURRENCY_NOT_ALLOWED')
    }
    const bounds = likilibaConfig.amounts[s.currencyCode as LikilibaCurrency]
    const max = s.cautionRequired ? bounds.max : bounds.maxWithoutCaution
    if (s.contributionAmount < bounds.min || s.contributionAmount > max) {
      throw new LikilibaException(
        `The contribution must be between ${formatAmount(bounds.min, s.currencyCode)} and ${formatAmount(max, s.currencyCode)}` +
          (s.cautionRequired ? '' : ' for a group without caution'),
        'AMOUNT_OUT_OF_RANGE'
      )
    }
    if (s.size < likilibaConfig.size.min || s.size > likilibaConfig.size.max) {
      throw new LikilibaException(
        `A likiliba has between ${likilibaConfig.size.min} and ${likilibaConfig.size.max} participants`,
        'SIZE_OUT_OF_RANGE'
      )
    }
    if (s.startsAt < now.plus({ hours: likilibaConfig.minLeadHours })) {
      throw new LikilibaException(
        `The first round must be due at least ${likilibaConfig.minLeadHours} hours from now`,
        'START_TOO_SOON'
      )
    }
    if (s.cautionRequired) {
      const m = s.cautionMultiplier ?? likilibaConfig.cautionMultiplier.default
      if (m < likilibaConfig.cautionMultiplier.min || m > likilibaConfig.cautionMultiplier.max) {
        throw new LikilibaException(
          'The caution is one or two contributions',
          'CAUTION_OUT_OF_RANGE'
        )
      }
    }
    const grace = s.graceHours ?? likilibaConfig.graceHours.default
    if (grace < likilibaConfig.graceHours.min || grace > likilibaConfig.graceHours.max) {
      throw new LikilibaException(
        'The grace period is between 24 and 168 hours',
        'GRACE_OUT_OF_RANGE'
      )
    }
    const escalation = s.escalationDays ?? likilibaConfig.escalationDays.default
    if (
      escalation < likilibaConfig.escalationDays.min ||
      escalation > likilibaConfig.escalationDays.max
    ) {
      throw new LikilibaException(
        'The escalation delay is between 3 and 30 days',
        'ESCALATION_OUT_OF_RANGE'
      )
    }
    if (s.penaltyMode !== 'none') {
      const cap = s.penaltyCapBps ?? likilibaConfig.penalty.defaultCapBps
      if (cap <= 0 || cap > likilibaConfig.penalty.maxCapBps) {
        throw new LikilibaException(
          'Penalties are capped at 10 % of the contribution',
          'PENALTY_CAP_OUT_OF_RANGE'
        )
      }
      if (s.penaltyMode === 'fixed') {
        const fixed = s.penaltyFixedAmount ?? 0n
        const maxDaily =
          (s.contributionAmount * BigInt(likilibaConfig.penalty.maxDailyBps)) / 10_000n
        if (fixed <= 0n || fixed > maxDaily) {
          throw new LikilibaException(
            `A daily penalty is at most ${formatAmount(maxDaily, s.currencyCode)} (2 % of the contribution)`,
            'PENALTY_OUT_OF_RANGE'
          )
        }
      } else {
        const daily = s.penaltyDailyBps ?? likilibaConfig.penalty.defaultDailyBps
        if (daily <= 0 || daily > likilibaConfig.penalty.maxDailyBps) {
          throw new LikilibaException(
            'A daily penalty is at most 2 % of the contribution',
            'PENALTY_OUT_OF_RANGE'
          )
        }
      }
    }
  }

  private static apply(likiliba: Likiliba, s: LikilibaSettings) {
    likiliba.name = s.name.trim()
    likiliba.description = s.description?.trim() || null
    likiliba.currencyCode = s.currencyCode as LikilibaCurrency
    likiliba.contributionAmount = s.contributionAmount
    likiliba.frequency = s.frequency
    likiliba.size = s.size
    likiliba.startsAt = s.startsAt
    likiliba.cautionRequired = s.cautionRequired
    likiliba.cautionMultiplier = s.cautionRequired
      ? (s.cautionMultiplier ?? likilibaConfig.cautionMultiplier.default)
      : null
    likiliba.graceHours = s.graceHours ?? likilibaConfig.graceHours.default
    likiliba.escalationDays = s.escalationDays ?? likilibaConfig.escalationDays.default
    likiliba.penaltyMode = s.penaltyMode
    likiliba.penaltyFixedAmount = s.penaltyMode === 'fixed' ? (s.penaltyFixedAmount ?? null) : null
    likiliba.penaltyDailyBps =
      s.penaltyMode === 'percent'
        ? (s.penaltyDailyBps ?? likilibaConfig.penalty.defaultDailyBps)
        : null
    likiliba.penaltyCapBps =
      s.penaltyMode === 'none' ? 0 : (s.penaltyCapBps ?? likilibaConfig.penalty.defaultCapBps)
    likiliba.orderingMode = s.orderingMode
  }

  static async create(
    user: User,
    settings: LikilibaSettings,
    correlationId: string
  ): Promise<Likiliba> {
    this.validateSettings(settings)
    if (likilibaConfig.requireKycForOrganiser && !(await isKycApproved(user.id))) {
      throw new LikilibaException(
        'Your identity must be verified to organise a likiliba',
        'KYC_REQUIRED',
        403
      )
    }
    const commissionBps = percentToBps(await FeeScheduleService.getFeePercent('likiliba_payout'))

    return db.transaction(async (trx) => {
      const wallet = await UserOnboardingService.createDefaultWallet(
        user.id,
        settings.currencyCode,
        correlationId,
        trx
      )

      const likiliba = new Likiliba()
      likiliba.code = newReference('LKB')
      this.apply(likiliba, settings)
      likiliba.creatorUserId = user.id
      likiliba.status = 'recruiting'
      likiliba.currentRoundNumber = 0
      await likiliba.useTransaction(trx).save()

      const pot = await LikilibaLedger.createPotWallet(likiliba, trx)
      likiliba.potWalletId = pot.id
      await likiliba.useTransaction(trx).save()

      const organiser = new LikilibaMember()
      organiser.likilibaId = likiliba.id
      organiser.userId = user.id
      organiser.role = 'organiser'
      organiser.status = 'admitted'
      organiser.walletId = wallet.id
      organiser.autoDebit = false
      await organiser.useTransaction(trx).save()

      const rules = await LikilibaRules.publish(likiliba, commissionBps, user.id, trx)

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'created',
        memberId: organiser.id,
        payload: {
          name: likiliba.name,
          currency_code: likiliba.currencyCode,
          contribution_amount: likiliba.contributionAmount,
          size: likiliba.size,
          caution_required: likiliba.cautionRequired,
          rule_version: rules.version,
          rules_hash: rules.rulesHash,
        },
        correlationId,
        trx,
      })

      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [user.id],
          type: 'created',
          title: 'Likiliba créée',
          message: `Votre likiliba « ${likiliba.name} » est créée. Invitez ${likiliba.size - 1} personne(s) pour la compléter.`,
          correlationId,
        },
        trx
      )
      return likiliba
    })
  }

  /** Changes the settings while members are still being gathered. Each change is a new rules version. */
  static async update(
    user: User,
    likilibaId: number,
    changes: Partial<LikilibaSettings>,
    correlationId: string
  ): Promise<Likiliba> {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      this.assertOrganiser(likiliba, user.id)
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'The rules can only change before the group is locked',
          'RULES_FROZEN',
          409
        )
      }

      const current: LikilibaSettings = {
        name: likiliba.name,
        description: likiliba.description,
        currencyCode: likiliba.currencyCode,
        contributionAmount: likiliba.contributionAmount,
        frequency: likiliba.frequency,
        size: likiliba.size,
        startsAt: likiliba.startsAt,
        cautionRequired: likiliba.cautionRequired,
        cautionMultiplier: likiliba.cautionMultiplier,
        graceHours: likiliba.graceHours,
        escalationDays: likiliba.escalationDays,
        penaltyMode: likiliba.penaltyMode,
        penaltyFixedAmount: likiliba.penaltyFixedAmount,
        penaltyDailyBps: likiliba.penaltyDailyBps,
        penaltyCapBps: likiliba.penaltyCapBps,
        orderingMode: likiliba.orderingMode,
      }
      if (changes.currencyCode && changes.currencyCode !== likiliba.currencyCode) {
        throw new LikilibaException(
          'The currency of a likiliba cannot change',
          'CURRENCY_LOCKED',
          409
        )
      }
      const next = { ...current, ...changes, currencyCode: likiliba.currencyCode }
      this.validateSettings(next)

      const members = await membersOf(likiliba, trx)
      if (next.size < members.length) {
        throw new LikilibaException(
          `The group already has ${members.length} members`,
          'SIZE_BELOW_MEMBERS',
          409
        )
      }

      const before = { ...current, contributionAmount: current.contributionAmount.toString() }
      this.apply(likiliba, next)
      await likiliba.useTransaction(trx).save()

      const previous = await LikilibaRules.current(likiliba, trx)
      const rules = await LikilibaRules.publish(
        likiliba,
        previous ? LikilibaRules.commissionBpsOf(previous) : 0,
        user.id,
        trx
      )

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'rules_updated',
        payload: {
          rule_version: rules.version,
          rules_hash: rules.rulesHash,
          changes: Object.keys(changes),
        },
        before,
        correlationId,
        trx,
      })
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: members.map((m) => m.userId).filter((id) => id !== user.id),
          type: 'rules_updated',
          title: 'Règles modifiées',
          message: `L'organisateur a modifié les règles de « ${likiliba.name} » (version ${rules.version}). Relisez-les avant de signer.`,
          data: { rule_version: rules.version },
          correlationId,
        },
        trx
      )
      return likiliba
    })
  }

  /* --------------------------------- Lock --------------------------------- */

  /**
   * Closes the roster. The rules become final — roster, order (manual) or the draw's commitment
   * (draw) included — and each member is asked to sign them.
   */
  static async lock(
    user: User,
    likilibaId: number,
    manualOrder: number[] | undefined,
    correlationId: string
  ): Promise<Likiliba> {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      this.assertOrganiser(likiliba, user.id)
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'Only a group still gathering members can be locked',
          'INVALID_STATE',
          409
        )
      }

      const members = await membersOf(likiliba, trx)
      if (members.length !== likiliba.size) {
        throw new LikilibaException(
          `The group needs ${likiliba.size} members, it has ${members.length}`,
          'GROUP_INCOMPLETE',
          409
        )
      }

      let order: number[] | undefined
      if (likiliba.orderingMode === 'manual') {
        order = manualOrder ?? []
        const ids = new Set(members.map((m) => m.id))
        if (
          order.length !== members.length ||
          new Set(order).size !== order.length ||
          order.some((id) => !ids.has(id))
        ) {
          throw new LikilibaException(
            'The order must list every member exactly once',
            'INVALID_ORDER'
          )
        }
        const organiser = members.find((m) => m.role === 'organiser')!
        if (order[0] === organiser.id) {
          throw new LikilibaException(
            'The organiser cannot place themselves first',
            'ORGANISER_FIRST'
          )
        }
      } else {
        const seed = randomBytes(32).toString('hex')
        likiliba.drawSeed = seed
        likiliba.drawSeedHash = sha256(seed)
      }

      // Invitations still open can no longer lead anywhere.
      const live = await LikilibaInvitation.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .whereIn('status', ['pending', 'accepted'])
      for (const invitation of live) {
        invitation.status = 'revoked'
        invitation.decidedAt = DateTime.now()
        await invitation.useTransaction(trx).save()
      }
      const revokedUsers = live.map((i) => i.inviteeUserId).filter((id): id is number => !!id)

      likiliba.status = 'locked'
      likiliba.lockedAt = DateTime.now()
      await likiliba.useTransaction(trx).save()

      const roster: RosterEntry[] = members.map((m) => ({
        member_id: m.id,
        user_id: m.userId,
        name: displayName(m.user),
      }))
      const previous = await LikilibaRules.current(likiliba, trx)
      const rules = await LikilibaRules.publish(
        likiliba,
        previous ? LikilibaRules.commissionBpsOf(previous) : 0,
        user.id,
        trx,
        { roster, manualOrder: order }
      )

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'locked',
        payload: {
          rule_version: rules.version,
          rules_hash: rules.rulesHash,
          ordering_mode: likiliba.orderingMode,
          draw_seed_hash: likiliba.drawSeedHash,
          manual_order: order ?? null,
          revoked_invitations: live.map((i) => i.id),
        },
        correlationId,
        trx,
      })

      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: members.map((m) => m.userId),
          type: 'locked',
          title: 'Signez les règles',
          message: likiliba.cautionRequired
            ? `« ${likiliba.name} » est complète. Lisez et signez les règles avec votre PIN ; votre caution de ${formatAmount(likiliba.cautionAmount, likiliba.currencyCode)} sera bloquée à la signature.`
            : `« ${likiliba.name} » est complète. Lisez et signez les règles avec votre PIN pour que le cycle puisse démarrer.`,
          data: { rule_version: rules.version, rules_hash: rules.rulesHash },
          correlationId,
        },
        trx
      )
      if (revokedUsers.length > 0) {
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: revokedUsers,
            type: 'invitation_closed',
            title: 'Invitation close',
            message: `« ${likiliba.name} » est désormais complète : votre invitation n'est plus valable.`,
            correlationId,
          },
          trx
        )
      }
      return likiliba
    })
  }

  /* --------------------------------- Start -------------------------------- */

  /**
   * Starts the cycle once every member has signed. The draw is revealed (or the signed manual
   * order applied), the calendar is fixed and the first round opens.
   */
  static async start(user: User, likilibaId: number, correlationId: string, now = DateTime.now()) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      this.assertOrganiser(likiliba, user.id)
      if (likiliba.status !== 'locked') {
        throw new LikilibaException(
          'The group must be locked and signed by everyone to start',
          'INVALID_STATE',
          409
        )
      }

      const rules = await LikilibaRules.current(likiliba, trx)
      const members = await membersOf(likiliba, trx)
      const unsigned = members.filter(
        (m) => m.status !== 'committed' || m.acceptedRuleVersionId !== rules?.id
      )
      if (unsigned.length > 0 || members.length !== likiliba.size) {
        throw new LikilibaException(
          `${unsigned.length} member(s) have not signed the rules yet`,
          'NOT_ALL_SIGNED',
          409
        )
      }

      const order =
        likiliba.orderingMode === 'manual'
          ? (rules!.rules.terms.manual_order as number[])
          : drawOrder(
              likiliba.drawSeed!,
              members.map((m) => m.id)
            )

      const byId = new Map(members.map((m) => [m.id, m]))
      for (const [index, memberId] of order.entries()) {
        const member = byId.get(memberId)!
        member.position = index + 1
        member.status = 'active'
        await member.useTransaction(trx).save()
      }

      // A late start shifts the whole calendar rather than making the first round due already.
      const earliest = now.plus({ hours: likilibaConfig.minLeadHours })
      const first = likiliba.startsAt < earliest ? earliest : likiliba.startsAt

      const rounds: LikilibaRound[] = []
      for (const [index, memberId] of order.entries()) {
        const round = new LikilibaRound()
        round.likilibaId = likiliba.id
        round.number = index + 1
        round.beneficiaryMemberId = memberId
        round.dueAt = dueDateOf(first, likiliba.frequency, index)
        round.graceEndsAt = round.dueAt.plus({ hours: likiliba.graceHours })
        round.status = 'scheduled'
        await round.useTransaction(trx).save()
        rounds.push(round)
      }

      likiliba.status = 'active'
      likiliba.startedAt = now
      likiliba.currentRoundNumber = 1
      await likiliba.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'started',
        payload: {
          draw_seed: likiliba.drawSeed,
          draw_seed_hash: likiliba.drawSeedHash,
          order: order.map((id, i) => ({
            position: i + 1,
            member_id: id,
            user_id: byId.get(id)!.userId,
          })),
          first_due_at: first.toISO(),
          calendar_shifted: first > likiliba.startsAt,
        },
        correlationId,
        trx,
      })

      for (const member of members) {
        const round = rounds.find((r) => r.beneficiaryMemberId === member.id)!
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [member.userId],
            type: 'started',
            title: 'Le cycle commence',
            message: `« ${likiliba.name} » a démarré. Vous recevrez au tour ${round.number}, prévu le ${formatDate(round.dueAt)}. Première cotisation : ${formatAmount(likiliba.contributionAmount, likiliba.currencyCode)} avant le ${formatDate(rounds[0].dueAt)}.`,
            data: { position: round.number, payout_due_at: round.dueAt.toISO() },
            correlationId,
          },
          trx
        )
      }

      const { LikilibaContributionService } =
        await import('#services/likiliba/contribution_service')
      await LikilibaContributionService.openRound(likiliba, rounds[0], correlationId, trx, now)
      return likiliba
    })
  }

  /* ----------------------------- Cancel / leave ---------------------------- */

  /** Before the start only. Every caution goes back to its owner. */
  static async cancel(user: User, likilibaId: number, reason: string, correlationId: string) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      this.assertOrganiser(likiliba, user.id)
      if (likiliba.status !== 'recruiting' && likiliba.status !== 'locked') {
        throw new LikilibaException(
          'A likiliba whose cycle has started cannot be cancelled by its organiser; contact Reemite support',
          'INVALID_STATE',
          409
        )
      }

      const members = await membersOf(likiliba, trx)
      for (const member of members) {
        await this.refundCaution(
          likiliba,
          member,
          'cancelled',
          { type: 'user', id: user.id },
          correlationId,
          trx
        )
      }
      const live = await LikilibaInvitation.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .whereIn('status', ['pending', 'accepted'])
      for (const invitation of live) {
        invitation.status = 'revoked'
        invitation.decidedAt = DateTime.now()
        await invitation.useTransaction(trx).save()
      }

      likiliba.status = 'cancelled'
      likiliba.cancelledAt = DateTime.now()
      likiliba.cancelReason = reason
      await likiliba.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'cancelled',
        payload: { reason },
        correlationId,
        trx,
      })
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [...members.map((m) => m.userId), ...live.map((i) => i.inviteeUserId ?? 0)],
          type: 'cancelled',
          title: 'Likiliba annulée',
          message: `L'organisateur a annulé « ${likiliba.name} » avant son démarrage. Motif : ${reason}.${likiliba.cautionRequired ? ' Les cautions bloquées ont été rendues.' : ''}`,
          correlationId,
        },
        trx
      )
      return likiliba
    })
  }

  /**
   * A member steps out before the start. After locking this reopens the roster: the rules must
   * be final for everyone who signs them, so every signature is undone and every caution refunded.
   */
  static async leave(user: User, likilibaId: number, correlationId: string) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      const member = await this.memberOf(likiliba, user.id, trx)
      if (member.role === 'organiser') {
        throw new LikilibaException(
          'The organiser cannot leave; cancel the likiliba instead',
          'ORGANISER_CANNOT_LEAVE',
          409
        )
      }
      if (likiliba.status !== 'recruiting' && likiliba.status !== 'locked') {
        throw new LikilibaException(
          'Nobody can leave once the cycle has started',
          'CYCLE_STARTED',
          409
        )
      }
      await this.removeFromRoster(
        likiliba,
        member,
        'left',
        { type: 'user', id: user.id },
        correlationId,
        trx
      )
      return likiliba
    })
  }

  /** The organiser drops someone admitted, while members are still being gathered. */
  static async removeMember(
    user: User,
    likilibaId: number,
    memberId: number,
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      this.assertOrganiser(likiliba, user.id)
      if (likiliba.status !== 'recruiting') {
        throw new LikilibaException(
          'Members can only be removed before the group is locked',
          'INVALID_STATE',
          409
        )
      }
      const member = await LikilibaMember.query({ client: trx })
        .where('id', memberId)
        .where('likilibaId', likiliba.id)
        .whereNotIn('status', ['left', 'removed'])
        .first()
      if (!member) throw new LikilibaException('No such member', 'MEMBER_NOT_FOUND', 404)
      if (member.role === 'organiser') {
        throw new LikilibaException('The organiser cannot be removed', 'INVALID_MEMBER', 409)
      }
      await this.removeFromRoster(
        likiliba,
        member,
        'removed',
        { type: 'user', id: user.id },
        correlationId,
        trx
      )
      return likiliba
    })
  }

  private static async removeFromRoster(
    likiliba: Likiliba,
    member: LikilibaMember,
    status: 'left' | 'removed',
    actor: LikilibaActor,
    correlationId: string,
    trx: TransactionClientContract
  ) {
    await this.refundCaution(likiliba, member, status, actor, correlationId, trx)
    member.status = status
    member.leftAt = DateTime.now()
    member.position = null
    await member.useTransaction(trx).save()

    const remaining = await membersOf(likiliba, trx)
    const reopened = likiliba.status === 'locked'
    if (reopened) {
      for (const other of remaining) {
        await this.refundCaution(likiliba, other, 'roster_reopened', actor, correlationId, trx)
        other.status = 'admitted'
        other.acceptedRuleVersionId = null
        other.rulesAcceptedAt = null
        await other.useTransaction(trx).save()
      }
      likiliba.status = 'recruiting'
      likiliba.lockedAt = null
      likiliba.drawSeed = null
      likiliba.drawSeedHash = null
      await likiliba.useTransaction(trx).save()
      const previous = await LikilibaRules.current(likiliba, trx)
      await LikilibaRules.publish(
        likiliba,
        previous ? LikilibaRules.commissionBpsOf(previous) : 0,
        likiliba.creatorUserId,
        trx
      )
    }

    await LikilibaJournal.record({
      likiliba,
      actor,
      eventType: status === 'left' ? 'member_left' : 'member_removed',
      memberId: member.id,
      payload: { user_id: member.userId, roster_reopened: reopened },
      correlationId,
      trx,
    })

    const user = await User.findOrFail(member.userId, { client: trx })
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [member.userId],
        type: status,
        title: status === 'left' ? 'Vous avez quitté la likiliba' : 'Retiré de la likiliba',
        message:
          status === 'left'
            ? `Vous ne faites plus partie de « ${likiliba.name} ».`
            : `L'organisateur vous a retiré de « ${likiliba.name} » avant son démarrage.`,
        correlationId,
      },
      trx
    )
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: remaining.map((m) => m.userId),
        type: 'roster_changed',
        title: 'Composition modifiée',
        message:
          `${displayName(user)} ne fait plus partie de « ${likiliba.name} ».` +
          (reopened
            ? ' Le groupe est rouvert : il faudra signer à nouveau les règles, et les cautions ont été rendues.'
            : ''),
        correlationId,
      },
      trx
    )
  }

  /** Returns a member's caution to their primary wallet, whatever is left of it. */
  static async refundCaution(
    likiliba: Likiliba,
    member: LikilibaMember,
    reason: string,
    actor: LikilibaActor,
    correlationId: string,
    trx: TransactionClientContract
  ): Promise<bigint> {
    if (!member.cautionWalletId) return 0n
    const balance = await LikilibaLedger.balanceOf(member.cautionWalletId, trx)
    if (balance <= 0n) return 0n

    const txn = await LikilibaLedger.post({
      type: 'likiliba_refund',
      likiliba,
      legs: [
        { walletId: member.cautionWalletId, direction: 'debit', amount: balance },
        { walletId: member.walletId, direction: 'credit', amount: balance },
      ],
      actor,
      description: `Likiliba ${likiliba.code}: caution refunded`,
      metadata: { member_id: member.id, reason },
      correlationId,
      trx,
    })
    await LikilibaJournal.record({
      likiliba,
      actor,
      eventType: 'caution_refunded',
      memberId: member.id,
      payload: { amount: balance, reason, transaction_id: txn.id },
      correlationId,
      trx,
    })
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [member.userId],
        type: 'caution_refunded',
        title: 'Caution rendue',
        message: `Votre caution de ${formatAmount(balance, likiliba.currencyCode)} pour « ${likiliba.name} » a été rendue sur votre compte ${likiliba.currencyCode}.`,
        data: { transaction_id: txn.id },
        email: {
          subject: `Caution rendue — ${formatAmount(balance, likiliba.currencyCode)}`,
          title: 'Caution rendue',
          sentence: `Votre caution pour la likiliba « ${likiliba.name} » vous a été rendue.`,
          caption: 'Montant rendu',
          amount: formatAmount(balance, likiliba.currencyCode),
          direction: 'in',
          rows: [
            ['Likiliba', `${likiliba.name} (${likiliba.code})`],
            ['Crédité sur', `Compte ${likiliba.currencyCode}`],
          ],
          reference: txn.id,
        },
        correlationId,
      },
      trx
    )
    return balance
  }

  /* -------------------------------- Helpers ------------------------------- */

  static assertOrganiser(likiliba: Likiliba, userId: number) {
    if (likiliba.creatorUserId !== userId) {
      throw new LikilibaException('Only the organiser can do this', 'NOT_ORGANISER', 403)
    }
  }

  static async memberOf(likiliba: Likiliba, userId: number, trx?: TransactionClientContract) {
    const member = await LikilibaMember.query(trx ? { client: trx } : {})
      .where('likilibaId', likiliba.id)
      .where('userId', userId)
      .whereNotIn('status', ['left', 'removed'])
      .first()
    if (!member) {
      throw new LikilibaException('You are not a member of this likiliba', 'NOT_MEMBER', 403)
    }
    return member
  }
}

/**
 * The verifiable draw: each member's rank is the SHA-256 of the revealed seed and their member id.
 * The seed's hash was fixed before anyone signed, so neither the organiser nor Reemite could pick
 * a seed that favours someone once the roster was known.
 */
export function drawOrder(seed: string, memberIds: number[]): number[] {
  return [...memberIds]
    .map((id) => ({ id, digest: sha256(`${seed}:${id}`) }))
    .sort((a, b) => (a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : a.id - b.id))
    .map((entry) => entry.id)
}
