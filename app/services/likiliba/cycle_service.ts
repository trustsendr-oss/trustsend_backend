import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import type LikilibaRound from '#models/likiliba_round'
import likilibaConfig from '#config/likiliba'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { LikilibaContributionService } from '#services/likiliba/contribution_service'
import { LikilibaDefaultService } from '#services/likiliba/default_service'
import { LikilibaPenaltyService } from '#services/likiliba/penalty_service'
import { LikilibaPayoutService } from '#services/likiliba/payout_service'
import { LikilibaInvitationService } from '#services/likiliba/invitation_service'
import { membersOf } from '#services/likiliba/likiliba_service'
import { formatDate, lockGroup, SYSTEM_ACTOR } from '#services/likiliba/shared'

/**
 * The scheduler's pass over every running group. Each group is processed in its own transaction,
 * under its row lock, so a member acting at the same moment simply waits; one group failing never
 * stops the others. Every step is idempotent: a pass run twice does nothing the second time.
 *
 * Order within a group: reminders → automatic debits → lateness → end of grace (cover or wait)
 * → penalties → escalation → payout.
 */
export class LikilibaCycleService {
  static async tick(now = DateTime.now()) {
    const expired = await LikilibaInvitationService.expireLapsed(now)
    const groups = await Likiliba.query().whereIn('status', ['active', 'suspended']).select('id')

    const failures: Array<{ id: number; error: unknown }> = []
    for (const { id } of groups) {
      try {
        await db.transaction((trx) => this.processGroup(id, now, trx))
      } catch (error) {
        console.error(`[likiliba] group ${id} could not be processed:`, error)
        failures.push({ id, error })
      }
    }
    return { groups: groups.length, expiredInvitations: expired, failures }
  }

  static async processGroup(id: number, now: DateTime<true>, trx: TransactionClientContract) {
    const likiliba = await lockGroup(id, trx)
    if (likiliba.status !== 'active' && likiliba.status !== 'suspended') return
    const correlationId = `likiliba-tick-${likiliba.code}-${now.toMillis()}`

    const round = await LikilibaContributionService.currentRound(likiliba, trx)
    await this.remindAndDebit(likiliba, round, correlationId, trx, now)
    await LikilibaDefaultService.handleGraceEnd(likiliba, round, correlationId, trx, now)
    await LikilibaDefaultService.retryCover(likiliba, round, correlationId, trx)
    await LikilibaPenaltyService.assess(likiliba, correlationId, trx, now)
    await LikilibaDefaultService.escalateIfDue(likiliba, round, correlationId, trx, now)
    await LikilibaPayoutService.tryPayout(likiliba, round, correlationId, trx, now)
  }

  private static async remindAndDebit(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract,
    now: DateTime<true>
  ) {
    if (
      round.status !== 'collecting' &&
      round.status !== 'waiting_funds' &&
      round.status !== 'escalated'
    )
      return

    const contributions = await LikilibaContribution.query({ client: trx })
      .where('roundId', round.id)
      .whereIn('status', ['pending', 'late'])
      .orderBy('id', 'asc')
      .forUpdate()
    if (contributions.length === 0) return

    const members = await membersOf(likiliba, trx)
    const byId = new Map(members.map((m) => [m.id, m]))
    const amount = formatAmount(likiliba.contributionAmount, likiliba.currencyCode)

    for (const contribution of contributions) {
      const member = byId.get(contribution.memberId)
      if (!member) continue

      // Reminder ahead of the due date.
      if (
        !contribution.remindedAt &&
        now < round.dueAt &&
        now >= round.dueAt.minus({ hours: likilibaConfig.reminderLeadHours })
      ) {
        contribution.remindedAt = now
        await contribution.useTransaction(trx).save()
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [member.userId],
            type: 'contribution_reminder',
            title: 'Rappel de cotisation',
            message: member.autoDebit
              ? `${amount} seront prélevés le ${formatDate(round.dueAt)} pour le tour ${round.number} de « ${likiliba.name} ». Gardez ce montant disponible sur votre compte ${likiliba.currencyCode}.`
              : `Votre cotisation de ${amount} au tour ${round.number} de « ${likiliba.name} » est due le ${formatDate(round.dueAt)}.`,
            data: { contribution: contribution.reference, due_at: round.dueAt.toISO() },
            correlationId,
          },
          trx
        )
      }

      if (now < round.dueAt) continue

      // Automatic debit, at the due date then every retry interval until the grace period ends.
      if (
        member.autoDebit &&
        now < round.graceEndsAt &&
        (!contribution.nextAttemptAt || contribution.nextAttemptAt <= now)
      ) {
        const paid = await LikilibaContributionService.attemptAutoDebit(
          likiliba,
          round,
          member,
          contribution,
          correlationId,
          trx,
          now
        )
        if (paid) continue
      }

      if (contribution.status === 'pending') {
        contribution.status = 'late'
        contribution.lateNotifiedAt = now
        await contribution.useTransaction(trx).save()
        await LikilibaJournal.record({
          likiliba,
          actor: SYSTEM_ACTOR,
          eventType: 'contribution_late',
          memberId: member.id,
          payload: { contribution: contribution.reference, round: round.number },
          correlationId,
          trx,
        })
        const consequence = likiliba.cautionRequired
          ? 'elle sera avancée par les cautions et vous devrez la rembourser'
          : `le tour sera bloqué jusqu'à votre paiement`
        await LikilibaNotifier.notify(
          likiliba,
          {
            userIds: [member.userId],
            type: 'contribution_late',
            title: 'Cotisation en retard',
            message:
              `Votre cotisation de ${amount} au tour ${round.number} de « ${likiliba.name} » n'est pas encore payée. ` +
              `Payez-la avant le ${formatDate(round.graceEndsAt)} : passé ce délai, ${consequence}` +
              (likiliba.penaltyMode !== 'none'
                ? ', et des pénalités s’appliqueront chaque jour.'
                : '.'),
            data: {
              contribution: contribution.reference,
              grace_ends_at: round.graceEndsAt.toISO(),
            },
            correlationId,
          },
          trx
        )
      }
    }
  }
}
