import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import type LikilibaMember from '#models/likiliba_member'
import LikilibaRound from '#models/likiliba_round'
import type User from '#models/user'
import likilibaConfig from '#config/likiliba'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { displayName, LikilibaService, membersOf } from '#services/likiliba/likiliba_service'
import {
  formatDate,
  LikilibaException,
  lockGroup,
  newReference,
  SYSTEM_ACTOR,
  type LikilibaActor,
} from '#services/likiliba/shared'

/**
 * Money going into the pot. Only a confirmed contribution counts as received: an expected one is
 * a `pending` row and nothing more.
 */
export class LikilibaContributionService {
  /**
   * Opens a round: one contribution row per member. The beneficiary's own share is `netted` from
   * the start — they do not pay into the round that pays them.
   */
  static async openRound(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ) {
    const members = await membersOf(likiliba, trx)
    round.status = 'collecting'
    round.openedAt = now
    await round.useTransaction(trx).save()

    for (const member of members) {
      const contribution = new LikilibaContribution()
      contribution.reference = newReference('LKC')
      contribution.likilibaId = likiliba.id
      contribution.roundId = round.id
      contribution.memberId = member.id
      contribution.amount = likiliba.contributionAmount
      contribution.status = member.id === round.beneficiaryMemberId ? 'netted' : 'pending'
      contribution.attempts = 0
      contribution.nextAttemptAt = member.autoDebit ? round.dueAt : null
      await contribution.useTransaction(trx).save()
    }

    const beneficiary = members.find((m) => m.id === round.beneficiaryMemberId)!
    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'round_opened',
      payload: {
        round: round.number,
        due_at: round.dueAt.toISO(),
        grace_ends_at: round.graceEndsAt.toISO(),
        beneficiary_member_id: beneficiary.id,
      },
      correlationId,
      trx,
    })

    const amount = formatAmount(likiliba.contributionAmount, likiliba.currencyCode)
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: members.filter((m) => m.id !== beneficiary.id).map((m) => m.userId),
        type: 'round_opened',
        title: `Tour ${round.number} ouvert`,
        message: `Cotisez ${amount} à « ${likiliba.name} » avant le ${formatDate(round.dueAt)}. Bénéficiaire de ce tour : ${displayName(beneficiary.user)}.`,
        data: { round: round.number, due_at: round.dueAt.toISO() },
        correlationId,
      },
      trx
    )
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [beneficiary.userId],
        type: 'your_round_opened',
        title: 'C’est votre tour',
        message: `Le tour ${round.number} de « ${likiliba.name} » est le vôtre : vous recevrez ${formatAmount(likiliba.roundAmount, likiliba.currencyCode)} brut le ${formatDate(round.dueAt)}, dès que toutes les cotisations seront réunies. Vous ne cotisez pas pour ce tour.`,
        data: { round: round.number, due_at: round.dueAt.toISO() },
        correlationId,
      },
      trx
    )
  }

  /** A member pays their share of the open round themselves. */
  static async pay(user: User, likilibaId: number, correlationId: string, idempotencyKey?: string) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      const member = await LikilibaService.memberOf(likiliba, user.id, trx)
      if (likiliba.status !== 'active' && likiliba.status !== 'suspended') {
        throw new LikilibaException('No round is open in this likiliba', 'NO_OPEN_ROUND', 409)
      }
      const round = await this.currentRound(likiliba, trx)
      const contribution = await LikilibaContribution.query({ client: trx })
        .where('roundId', round.id)
        .where('memberId', member.id)
        .forUpdate()
        .firstOrFail()

      if (contribution.status === 'netted') {
        throw new LikilibaException(
          'You receive this round: you do not contribute to it',
          'OWN_ROUND',
          409
        )
      }
      if (contribution.status === 'covered') {
        throw new LikilibaException(
          'Your caution already covered this contribution: repay your debt instead',
          'ALREADY_COVERED',
          409
        )
      }
      if (contribution.status !== 'pending' && contribution.status !== 'late') {
        throw new LikilibaException('This contribution is already paid', 'ALREADY_PAID', 409)
      }

      await this.settle(
        likiliba,
        round,
        member,
        contribution,
        'manual',
        { type: 'user', id: user.id },
        correlationId,
        trx,
        idempotencyKey
      )

      const { LikilibaPayoutService } = await import('#services/likiliba/payout_service')
      await LikilibaPayoutService.tryPayout(likiliba, round, correlationId, trx)
      return contribution
    })
  }

  /**
   * One automatic-debit attempt, by the scheduler. A refusal is not an error: it is recorded on
   * the contribution, the member is told why, and the next attempt is planned.
   */
  static async attemptAutoDebit(
    likiliba: Likiliba,
    round: LikilibaRound,
    member: LikilibaMember,
    contribution: LikilibaContribution,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ): Promise<boolean> {
    const wallets = await LikilibaLedger.lockWallets([member.walletId], trx)
    try {
      await LikilibaLedger.assertCanDebit(wallets.get(member.walletId)!, contribution.amount, trx)
    } catch (error) {
      if (!(error instanceof LikilibaException)) throw error
      contribution.attempts += 1
      contribution.lastAttemptAt = now
      contribution.lastFailureReason = error.code
      const next = now.plus({ hours: likilibaConfig.autoDebitRetryHours })
      contribution.nextAttemptAt = next < round.graceEndsAt ? next : null
      await contribution.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: SYSTEM_ACTOR,
        eventType: 'auto_debit_failed',
        memberId: member.id,
        payload: {
          contribution: contribution.reference,
          round: round.number,
          reason: error.code,
          attempt: contribution.attempts,
        },
        correlationId,
        trx,
      })
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [member.userId],
          type: 'auto_debit_failed',
          title: 'Prélèvement refusé',
          message:
            `Le prélèvement de ${formatAmount(contribution.amount, likiliba.currencyCode)} pour « ${likiliba.name} » (tour ${round.number}) a échoué : ${failureLabel(error.code)}. ` +
            (contribution.nextAttemptAt
              ? `Nouvelle tentative le ${formatDate(contribution.nextAttemptAt)}. Vous pouvez aussi payer vous-même dès maintenant.`
              : `Payez vous-même avant le ${formatDate(round.graceEndsAt)} pour éviter la procédure de retard.`),
          data: { contribution: contribution.reference, reason: error.code },
          correlationId,
        },
        trx
      )
      return false
    }

    contribution.attempts += 1
    contribution.lastAttemptAt = now
    await this.settle(
      likiliba,
      round,
      member,
      contribution,
      'auto_debit',
      SYSTEM_ACTOR,
      correlationId,
      trx
    )
    return true
  }

  /** Moves the share into the pot and confirms it. The wallet checks run inside the lock. */
  private static async settle(
    likiliba: Likiliba,
    round: LikilibaRound,
    member: LikilibaMember,
    contribution: LikilibaContribution,
    via: 'manual' | 'auto_debit',
    actor: LikilibaActor,
    correlationId: string,
    trx: TransactionClientContract,
    idempotencyKey?: string
  ) {
    const wallets = await LikilibaLedger.lockWallets([member.walletId], trx)
    await LikilibaLedger.assertCanDebit(wallets.get(member.walletId)!, contribution.amount, trx)

    const wasLate = contribution.status === 'late'
    const txn = await LikilibaLedger.post({
      type: 'likiliba_contribution',
      likiliba,
      legs: [
        { walletId: member.walletId, direction: 'debit', amount: contribution.amount },
        { walletId: likiliba.potWalletId!, direction: 'credit', amount: contribution.amount },
      ],
      actor,
      description: `Likiliba ${likiliba.code}: contribution ${contribution.reference}`,
      metadata: {
        member_id: member.id,
        round: round.number,
        contribution: contribution.reference,
        via,
      },
      correlationId,
      idempotencyKey,
      trx,
    })

    contribution.status = 'confirmed'
    contribution.paidVia = via
    contribution.ledgerTransactionId = txn.id
    contribution.confirmedAt = DateTime.now()
    contribution.nextAttemptAt = null
    contribution.lastFailureReason = null
    await contribution.useTransaction(trx).save()

    await LikilibaJournal.record({
      likiliba,
      actor,
      eventType: 'contribution_confirmed',
      memberId: member.id,
      payload: {
        contribution: contribution.reference,
        round: round.number,
        amount: contribution.amount,
        via,
        late: wasLate,
        transaction_id: txn.id,
      },
      correlationId,
      trx,
    })

    const amount = formatAmount(contribution.amount, likiliba.currencyCode)
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [member.userId],
        type: 'contribution_confirmed',
        title: 'Cotisation reçue',
        message: `Votre cotisation de ${amount} à « ${likiliba.name} » (tour ${round.number}) est confirmée.`,
        data: { contribution: contribution.reference, transaction_id: txn.id },
        email: {
          subject: `Cotisation confirmée — ${amount}`,
          title: 'Cotisation confirmée',
          sentence: `Votre cotisation au tour ${round.number} de la likiliba « ${likiliba.name} » est bien arrivée dans la cagnotte.`,
          caption: 'Cotisation',
          amount,
          direction: 'out',
          rows: [
            ['Likiliba', `${likiliba.name} (${likiliba.code})`],
            ['Tour', String(round.number)],
            ['Mode', via === 'auto_debit' ? 'Prélèvement automatique' : 'Paiement manuel'],
            ['Débité de', `Compte ${likiliba.currencyCode}`],
            ['Frais', 'Gratuit'],
            ['Référence cotisation', contribution.reference],
          ],
          reference: txn.id,
        },
        correlationId,
      },
      trx
    )
  }

  static async currentRound(likiliba: Likiliba, trx: TransactionClientContract) {
    const round = await LikilibaRound.query({ client: trx })
      .where('likilibaId', likiliba.id)
      .where('number', likiliba.currentRoundNumber)
      .forUpdate()
      .first()
    if (!round)
      throw new LikilibaException('No round is open in this likiliba', 'NO_OPEN_ROUND', 409)
    return round
  }
}

export function failureLabel(code: string): string {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return 'solde insuffisant'
    case 'FUNDS_RESERVED':
      return 'une partie du solde est réservée pour un retrait en cours'
    case 'LIMIT_EXCEEDED':
      return 'plafond de votre compte atteint'
    case 'WALLET_INACTIVE':
      return 'compte inactif'
    default:
      return 'opération refusée'
  }
}
