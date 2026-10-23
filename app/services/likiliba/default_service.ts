import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaDebt from '#models/likiliba_debt'
import type LikilibaMember from '#models/likiliba_member'
import type LikilibaRound from '#models/likiliba_round'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { displayName, membersOf } from '#services/likiliba/likiliba_service'
import { formatDate, prorata, SYSTEM_ACTOR } from '#services/likiliba/shared'

/**
 * What happens to a contribution still missing when the grace period ends.
 *
 * With a caution: the defaulter's own caution pays first, then the other members' cautions, in
 * proportion to what each still holds. Never partially — either the whole share is covered, or
 * nothing moves and the round waits. Without a caution: the round waits for the member.
 * A round that waits too long is escalated, and the group suspended for Reemite support.
 */
export class LikilibaDefaultService {
  static async handleGraceEnd(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ) {
    if (round.status !== 'collecting' || now < round.graceEndsAt) return

    const missing = await this.missingContributions(round, trx)
    if (missing.length === 0) return

    if (likiliba.cautionRequired) {
      const uncovered = await this.coverAll(likiliba, round, missing, correlationId, trx)
      if (uncovered.length === 0) return
      await this.wait(likiliba, round, uncovered, 'cautions_exhausted', correlationId, trx, now)
    } else {
      await this.wait(likiliba, round, missing, 'no_caution', correlationId, trx, now)
    }
  }

  /** A waiting round in a caution group is retried whenever cautions may have been restored. */
  static async retryCover(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract
  ) {
    if (!likiliba.cautionRequired) return
    if (round.status !== 'waiting_funds' && round.status !== 'escalated') return
    const missing = await this.missingContributions(round, trx)
    if (missing.length > 0) await this.coverAll(likiliba, round, missing, correlationId, trx)
  }

  /** Rounds that waited past the escalation delay suspend the group. */
  static async escalateIfDue(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ) {
    if (round.status !== 'waiting_funds' || !round.waitingSince) return
    if (now < round.waitingSince.plus({ days: likiliba.escalationDays })) return
    // A round whose missing shares arrived in the meantime is about to be paid, not escalated.
    const missing = await this.missingContributions(round, trx)
    if (missing.length === 0) return

    round.status = 'escalated'
    round.escalatedAt = now
    await round.useTransaction(trx).save()

    likiliba.status = 'suspended'
    likiliba.suspendedAt = now
    likiliba.suspensionReason = `Round ${round.number} waited ${likiliba.escalationDays} days for missing contributions`
    await likiliba.useTransaction(trx).save()

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'escalated',
      payload: { round: round.number, waiting_since: round.waitingSince.toISO() },
      correlationId,
      trx,
    })
    const members = await membersOf(likiliba, trx)
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: members.map((m) => m.userId),
        type: 'suspended',
        title: 'Likiliba suspendue',
        message: `Le tour ${round.number} de « ${likiliba.name} » attend depuis ${likiliba.escalationDays} jours des cotisations manquantes. Le groupe est suspendu et le support Reemite va intervenir. Les cotisations en retard peuvent toujours être payées.`,
        data: { round: round.number },
        correlationId,
      },
      trx
    )
  }

  private static async missingContributions(round: LikilibaRound, trx: TransactionClientContract) {
    return LikilibaContribution.query({ client: trx })
      .where('roundId', round.id)
      .whereIn('status', ['pending', 'late'])
      .orderBy('id', 'asc')
      .forUpdate()
  }

  /** Covers what it can, contribution by contribution. Returns the contributions left uncovered. */
  private static async coverAll(
    likiliba: Likiliba,
    round: LikilibaRound,
    missing: LikilibaContribution[],
    correlationId: string,
    trx: TransactionClientContract
  ): Promise<LikilibaContribution[]> {
    const members = await membersOf(likiliba, trx)
    const uncovered: LikilibaContribution[] = []
    for (const contribution of missing) {
      const covered = await this.cover(likiliba, round, contribution, members, correlationId, trx)
      if (!covered) uncovered.push(contribution)
    }
    return uncovered
  }

  private static async cover(
    likiliba: Likiliba,
    round: LikilibaRound,
    contribution: LikilibaContribution,
    members: LikilibaMember[],
    correlationId: string,
    trx: TransactionClientContract
  ): Promise<boolean> {
    const defaulter = members.find((m) => m.id === contribution.memberId)!
    const needed = contribution.amount

    const balances = new Map<number, bigint>()
    for (const m of members) {
      if (m.cautionWalletId)
        balances.set(m.id, await LikilibaLedger.balanceOf(m.cautionWalletId, trx))
    }

    const own = balances.get(defaulter.id) ?? 0n
    const fromOwn = own < needed ? own : needed
    const rest = needed - fromOwn
    const others = members
      .filter((m) => m.id !== defaulter.id && (balances.get(m.id) ?? 0n) > 0n)
      .map((m) => ({ key: m.id, weight: balances.get(m.id)! }))
    const othersTotal = others.reduce((s, o) => s + o.weight, 0n)
    if (othersTotal < rest) return false

    const shares = prorata(rest, others)
    if (fromOwn > 0n) shares.set(defaulter.id, fromOwn)

    const byId = new Map(members.map((m) => [m.id, m]))
    const txn = await LikilibaLedger.post({
      type: 'likiliba_caution_cover',
      likiliba,
      legs: [
        ...[...shares].map(([memberId, amount]) => ({
          walletId: byId.get(memberId)!.cautionWalletId!,
          direction: 'debit' as const,
          amount,
        })),
        { walletId: likiliba.potWalletId!, direction: 'credit', amount: needed },
      ],
      actor: SYSTEM_ACTOR,
      description: `Likiliba ${likiliba.code}: contribution ${contribution.reference} covered by cautions`,
      metadata: {
        contribution: contribution.reference,
        round: round.number,
        defaulter_member_id: defaulter.id,
        shares: Object.fromEntries([...shares].map(([k, v]) => [k, v.toString()])),
      },
      correlationId,
      trx,
    })

    for (const [creditorId, amount] of shares) {
      const debt = new LikilibaDebt()
      debt.likilibaId = likiliba.id
      debt.debtorMemberId = defaulter.id
      debt.creditorMemberId = creditorId
      debt.origin = 'caution_cover'
      debt.contributionId = contribution.id
      debt.amount = amount
      debt.remaining = amount
      debt.status = 'open'
      await debt.useTransaction(trx).save()
    }

    contribution.status = 'covered'
    contribution.coveredAt = DateTime.now()
    contribution.ledgerTransactionId = txn.id
    contribution.nextAttemptAt = null
    await contribution.useTransaction(trx).save()

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'contribution_covered',
      memberId: defaulter.id,
      payload: {
        contribution: contribution.reference,
        round: round.number,
        amount: needed,
        from_own_caution: fromOwn,
        from_other_cautions: rest,
        transaction_id: txn.id,
      },
      correlationId,
      trx,
    })

    const cur = likiliba.currencyCode
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [defaulter.userId],
        type: 'contribution_covered',
        title: 'Cotisation avancée par les cautions',
        message:
          `Votre cotisation de ${formatAmount(needed, cur)} au tour ${round.number} de « ${likiliba.name} » n'a pas été payée avant la fin du délai de grâce. ` +
          `Elle a été avancée : ${formatAmount(fromOwn, cur)} par votre caution` +
          (rest > 0n ? `, ${formatAmount(rest, cur)} par les cautions d'autres membres` : '') +
          `. Vous devez rembourser ${formatAmount(needed, cur)}` +
          (likiliba.penaltyMode !== 'none'
            ? ` ; des pénalités courent chaque jour jusqu'au remboursement.`
            : '.') +
          ` À défaut, ce montant sera retenu sur votre versement ou sur votre caution en fin de cycle.`,
        data: { contribution: contribution.reference, owed: needed.toString() },
        email: {
          subject: `Cotisation avancée par les cautions — ${formatAmount(needed, cur)}`,
          title: 'Cotisation avancée',
          sentence: `Votre cotisation au tour ${round.number} de la likiliba « ${likiliba.name} » a été avancée par les cautions du groupe. Vous devez rembourser cette avance.`,
          caption: 'Montant à rembourser',
          amount: formatAmount(needed, cur),
          status: 'pending',
          rows: [
            ['Likiliba', `${likiliba.name} (${likiliba.code})`],
            ['Tour', String(round.number)],
            ['Avancé par votre caution', formatAmount(fromOwn, cur)],
            ['Avancé par les autres cautions', rest > 0n ? formatAmount(rest, cur) : null],
            ['Référence cotisation', contribution.reference],
          ],
          reference: txn.id,
          notice: {
            tone: 'warning',
            text: 'Remboursez depuis l’application pour arrêter les pénalités et reconstituer les cautions.',
          },
        },
        correlationId,
      },
      trx
    )

    const creditors = [...shares.keys()].filter((id) => id !== defaulter.id)
    for (const creditorId of creditors) {
      const creditor = byId.get(creditorId)!
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [creditor.userId],
          type: 'caution_used',
          title: 'Votre caution a été utilisée',
          message: `${formatAmount(shares.get(creditorId)!, cur)} de votre caution ont avancé la cotisation de ${displayName(defaulter.user)} au tour ${round.number} de « ${likiliba.name} ». Ce montant vous est dû et sera rendu à votre caution dès son remboursement.`,
          data: {
            contribution: contribution.reference,
            amount: shares.get(creditorId)!.toString(),
          },
          correlationId,
        },
        trx
      )
    }
    return true
  }

  private static async wait(
    likiliba: Likiliba,
    round: LikilibaRound,
    missing: LikilibaContribution[],
    reason: 'no_caution' | 'cautions_exhausted',
    correlationId: string,
    trx: TransactionClientContract,
    now: DateTime
  ) {
    if (round.status === 'waiting_funds') return
    round.status = 'waiting_funds'
    round.waitingSince = now
    await round.useTransaction(trx).save()

    const members = await membersOf(likiliba, trx)
    const byId = new Map(members.map((m) => [m.id, m]))
    const late = missing.map((c) => byId.get(c.memberId)!)
    const beneficiary = byId.get(round.beneficiaryMemberId)!

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'round_waiting',
      payload: { round: round.number, reason, missing: missing.map((c) => c.reference) },
      correlationId,
      trx,
    })

    const escalation = formatDate(now.plus({ days: likiliba.escalationDays }))
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [beneficiary.userId],
        type: 'payout_delayed',
        title: 'Votre versement est retardé',
        message: `Il manque ${missing.length} cotisation(s) au tour ${round.number} de « ${likiliba.name} »${reason === 'cautions_exhausted' ? ' et les cautions ne suffisent plus à les avancer' : ''}. Aucun versement partiel n'est fait : vous recevrez la totalité dès leur régularisation. Sans régularisation avant le ${escalation}, le support Reemite interviendra.`,
        data: { round: round.number },
        correlationId,
      },
      trx
    )
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: late.map((m) => m.userId),
        type: 'round_blocked_by_you',
        title: 'Votre cotisation bloque le tour',
        message: `Votre cotisation de ${formatAmount(likiliba.contributionAmount, likiliba.currencyCode)} au tour ${round.number} de « ${likiliba.name} » manque toujours. ${displayName(beneficiary.user)} ne peut pas être payé tant qu'elle n'est pas réglée${likiliba.penaltyMode !== 'none' ? ', et des pénalités courent chaque jour' : ''}. Payez-la depuis l'application.`,
        data: { round: round.number },
        correlationId,
      },
      trx
    )
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: members
          .filter((m) => m.id !== beneficiary.id && !late.some((l) => l.id === m.id))
          .map((m) => m.userId),
        type: 'round_waiting',
        title: `Tour ${round.number} en attente`,
        message: `Le tour ${round.number} de « ${likiliba.name} » attend ${missing.length} cotisation(s) en retard. Le calendrier suivant sera décalé du retard.`,
        data: { round: round.number },
        correlationId,
      },
      trx
    )
  }
}
