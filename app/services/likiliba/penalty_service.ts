import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaDebt from '#models/likiliba_debt'
import type LikilibaMember from '#models/likiliba_member'
import LikilibaPenalty from '#models/likiliba_penalty'
import type LikilibaRound from '#models/likiliba_round'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { displayName, membersOf } from '#services/likiliba/likiliba_service'
import {
  bpsOf,
  LikilibaException,
  lockGroup,
  newReference,
  SYSTEM_ACTOR,
  type LikilibaActor,
} from '#services/likiliba/shared'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Late penalties, one row per day of lateness and contribution.
 *
 * - They start when the grace period ends, and run while the obligation is outstanding: the
 *   contribution is unpaid, or the caution advance that covered it is not repaid yet.
 * - Daily amount: fixed, or a rate of the contribution. All penalties on one contribution stop at
 *   the cap (at most 10 % of it).
 * - Paid to the beneficiary of the late round, from the late member's primary wallet. If that
 *   balance cannot pay, the penalty becomes a debt to the beneficiary.
 * - A beneficiary is never penalised on their own round: their share is netted.
 */
export class LikilibaPenaltyService {
  /** Daily amount before the cap. */
  static dailyAmount(likiliba: Likiliba): bigint {
    if (likiliba.penaltyMode === 'fixed') return likiliba.penaltyFixedAmount ?? 0n
    if (likiliba.penaltyMode === 'percent')
      return bpsOf(likiliba.contributionAmount, likiliba.penaltyDailyBps ?? 0)
    return 0n
  }

  static capAmount(likiliba: Likiliba): bigint {
    return bpsOf(likiliba.contributionAmount, likiliba.penaltyCapBps)
  }

  /** Assesses every day due across the group's rounds. Safe to run any number of times. */
  static async assess(
    likiliba: Likiliba,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ) {
    if (likiliba.penaltyMode === 'none') return
    const daily = this.dailyAmount(likiliba)
    const cap = this.capAmount(likiliba)
    if (daily <= 0n || cap <= 0n) return

    const rows = await LikilibaContribution.query({ client: trx })
      .where('likilibaId', likiliba.id)
      .whereIn('status', ['late', 'pending', 'covered'])
      .whereHas('round', (q) => q.where('graceEndsAt', '<', now.toJSDate()))
      .preload('round')
      .orderBy('id', 'asc')
      .forUpdate()
    if (rows.length === 0) return

    const members = await membersOf(likiliba, trx)
    const byId = new Map(members.map((m) => [m.id, m]))

    for (const contribution of rows) {
      const round = contribution.round
      if (contribution.memberId === round.beneficiaryMemberId) continue
      if (!(await this.isOutstanding(contribution, trx))) continue

      const previous = await LikilibaPenalty.query({ client: trx })
        .where('contributionId', contribution.id)
        .orderBy('dayNumber', 'asc')
      let charged = previous.reduce((s, p) => s + p.amount, 0n)
      const lastDay = previous.at(-1)?.dayNumber ?? 0
      const daysDue = Math.floor(now.diff(round.graceEndsAt).toMillis() / DAY_MS) + 1

      for (let day = lastDay + 1; day <= daysDue; day++) {
        const amount = cap - charged < daily ? cap - charged : daily
        if (amount <= 0n) break
        await this.charge(
          likiliba,
          round,
          contribution,
          byId.get(contribution.memberId)!,
          byId.get(round.beneficiaryMemberId)!,
          day,
          amount,
          charged + amount,
          cap,
          correlationId,
          trx,
          now
        )
        charged += amount
      }
    }
  }

  private static async isOutstanding(
    contribution: LikilibaContribution,
    trx: TransactionClientContract
  ) {
    if (contribution.status === 'late' || contribution.status === 'pending') return true
    const open = await LikilibaDebt.query({ client: trx })
      .where('contributionId', contribution.id)
      .where('origin', 'caution_cover')
      .where('status', 'open')
      .first()
    return !!open
  }

  private static async charge(
    likiliba: Likiliba,
    round: LikilibaRound,
    contribution: LikilibaContribution,
    member: LikilibaMember,
    beneficiary: LikilibaMember,
    day: number,
    amount: bigint,
    cumulative: bigint,
    cap: bigint,
    correlationId: string,
    trx: TransactionClientContract,
    now: DateTime
  ) {
    const penalty = new LikilibaPenalty()
    penalty.reference = newReference('LKP')
    penalty.likilibaId = likiliba.id
    penalty.contributionId = contribution.id
    penalty.memberId = member.id
    penalty.beneficiaryMemberId = beneficiary.id
    penalty.dayNumber = day
    penalty.amount = amount
    penalty.basis = likiliba.penaltyMode === 'fixed' ? 'fixed' : 'percent'
    penalty.assessedAt = now

    let paid = false
    const wallets = await LikilibaLedger.lockWallets([member.walletId], trx)
    try {
      await LikilibaLedger.assertCanDebit(wallets.get(member.walletId)!, amount, trx)
      paid = true
    } catch (error) {
      if (!(error instanceof LikilibaException)) throw error
    }

    if (paid) {
      const txn = await LikilibaLedger.post({
        type: 'likiliba_penalty',
        likiliba,
        legs: [
          { walletId: member.walletId, direction: 'debit', amount },
          { walletId: beneficiary.walletId, direction: 'credit', amount },
        ],
        actor: SYSTEM_ACTOR,
        description: `Likiliba ${likiliba.code}: late penalty ${penalty.reference}`,
        metadata: {
          penalty: penalty.reference,
          contribution: contribution.reference,
          round: round.number,
          day,
        },
        correlationId,
        trx,
      })
      penalty.status = 'paid'
      penalty.ledgerTransactionId = txn.id
      penalty.settledAt = now
      await penalty.useTransaction(trx).save()
    } else {
      penalty.status = 'in_debt'
      await penalty.useTransaction(trx).save()
      const debt = new LikilibaDebt()
      debt.likilibaId = likiliba.id
      debt.debtorMemberId = member.id
      debt.creditorMemberId = beneficiary.id
      debt.origin = 'penalty'
      debt.contributionId = contribution.id
      debt.penaltyId = penalty.id
      debt.amount = amount
      debt.remaining = amount
      debt.status = 'open'
      await debt.useTransaction(trx).save()
    }

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'penalty_assessed',
      memberId: member.id,
      payload: {
        penalty: penalty.reference,
        contribution: contribution.reference,
        round: round.number,
        day,
        amount,
        cumulative,
        cap,
        status: penalty.status,
        beneficiary_member_id: beneficiary.id,
        transaction_id: penalty.ledgerTransactionId,
      },
      correlationId,
      trx,
    })

    const cur = likiliba.currencyCode
    const reason =
      contribution.status === 'covered'
        ? `l'avance de votre cotisation ${contribution.reference} (tour ${round.number}) n'est pas encore remboursée`
        : `votre cotisation ${contribution.reference} (tour ${round.number}) n'est pas encore payée`
    const capReached = cumulative >= cap
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [member.userId],
        type: 'penalty_assessed',
        title: `Pénalité de retard — jour ${day}`,
        message:
          `${formatAmount(amount, cur)} de pénalité dans « ${likiliba.name} » : ${reason}. ` +
          `Cumul sur cette cotisation : ${formatAmount(cumulative, cur)} sur un plafond de ${formatAmount(cap, cur)}${capReached ? ' (plafond atteint, plus aucune pénalité ne sera comptée)' : ''}. ` +
          (paid
            ? `Débitée de votre compte et versée à ${displayName(beneficiary.user)}, bénéficiaire du tour.`
            : `Votre solde ne la couvrait pas : elle s'ajoute à vos dettes envers ${displayName(beneficiary.user)}.`),
        data: {
          penalty: penalty.reference,
          contribution: contribution.reference,
          day,
          amount: amount.toString(),
          cumulative: cumulative.toString(),
          cap: cap.toString(),
          status: penalty.status,
        },
        email: {
          subject: `Pénalité de retard — ${formatAmount(amount, cur)}`,
          title: 'Pénalité de retard',
          sentence: `Une pénalité de retard s'applique dans la likiliba « ${likiliba.name} » : ${reason}.`,
          caption: 'Pénalité',
          amount: formatAmount(amount, cur),
          direction: 'out',
          status: paid ? 'completed' : 'pending',
          rows: [
            ['Likiliba', `${likiliba.name} (${likiliba.code})`],
            ['Tour', String(round.number)],
            ['Jour de retard', String(day)],
            ['Cumul', formatAmount(cumulative, cur)],
            ['Plafond', formatAmount(cap, cur)],
            ['Versée à', displayName(beneficiary.user)],
            ['Statut', paid ? 'Payée' : 'Ajoutée à vos dettes'],
            ['Référence pénalité', penalty.reference],
          ],
          reference: penalty.ledgerTransactionId ?? penalty.reference,
        },
        correlationId,
      },
      trx
    )
    if (paid) {
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [beneficiary.userId],
          type: 'penalty_received',
          title: 'Pénalité reçue',
          message: `Vous avez reçu ${formatAmount(amount, cur)} de pénalité de ${displayName(member.user)} pour son retard au tour ${round.number} de « ${likiliba.name} ».`,
          data: { penalty: penalty.reference },
          correlationId,
        },
        trx
      )
    }
  }

  /**
   * Reemite support cancels a penalty still owed (never one already paid: that money is the
   * beneficiary's). The debt it created is written off.
   */
  static async waive(
    internalUserId: number,
    penaltyId: number,
    reason: string,
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const found = await LikilibaPenalty.find(penaltyId, { client: trx })
      if (!found) throw new LikilibaException('This penalty does not exist', 'NOT_FOUND', 404)
      const likiliba = await lockGroup(found.likilibaId, trx)
      const penalty = await LikilibaPenalty.query({ client: trx })
        .where('id', found.id)
        .forUpdate()
        .firstOrFail()
      if (penalty.status !== 'in_debt') {
        throw new LikilibaException(
          'Only a penalty still owed can be waived',
          'PENALTY_NOT_OWED',
          409
        )
      }
      const actor: LikilibaActor = { type: 'internal_user', id: internalUserId }
      const now = DateTime.now()
      penalty.status = 'waived'
      penalty.waivedByInternalUserId = internalUserId
      penalty.waiveReason = reason
      penalty.settledAt = now
      await penalty.useTransaction(trx).save()
      await LikilibaDebt.query({ client: trx })
        .where('penaltyId', penalty.id)
        .where('status', 'open')
        .update({
          status: 'written_off',
          remaining: 0,
          settled_at: now.toJSDate(),
          updated_at: now.toJSDate(),
        })

      await LikilibaJournal.record({
        likiliba,
        actor,
        eventType: 'penalty_waived',
        memberId: penalty.memberId,
        payload: { penalty: penalty.reference, amount: penalty.amount, reason },
        correlationId,
        trx,
      })
      const members = await membersOf(likiliba, trx)
      const byId = new Map(members.map((m) => [m.id, m]))
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [
            byId.get(penalty.memberId)?.userId ?? 0,
            byId.get(penalty.beneficiaryMemberId)?.userId ?? 0,
          ],
          type: 'penalty_waived',
          title: 'Pénalité annulée',
          message: `Le support Reemite a annulé la pénalité ${penalty.reference} de ${formatAmount(penalty.amount, likiliba.currencyCode)} dans « ${likiliba.name} ». Motif : ${reason}.`,
          data: { penalty: penalty.reference },
          correlationId,
        },
        trx
      )
      return penalty
    })
  }

  /** The detailed list members read: one line per day charged, with what it was for. */
  static async listFor(likiliba: Likiliba, memberId?: number) {
    const query = LikilibaPenalty.query()
      .where('likilibaId', likiliba.id)
      .preload('contribution', (q) => q.preload('round'))
      .preload('member', (q) => q.preload('user'))
      .preload('beneficiary', (q) => q.preload('user'))
      .orderBy('assessedAt', 'desc')
      .orderBy('id', 'desc')
    if (memberId) query.where('memberId', memberId)
    const penalties = await query

    const cumulative = new Map<number, bigint>()
    for (const p of [...penalties].reverse()) {
      cumulative.set(p.id, (cumulative.get(-p.contributionId) ?? 0n) + p.amount)
      cumulative.set(-p.contributionId, cumulative.get(p.id)!)
    }
    const cap = this.capAmount(likiliba)
    return penalties.map((p) => ({ penalty: p, cumulative: cumulative.get(p.id)!, cap }))
  }
}
