import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import LikilibaRound from '#models/likiliba_round'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { membersOf } from '#services/likiliba/likiliba_service'
import { LikilibaException, lockGroup, type LikilibaActor } from '#services/likiliba/shared'

/**
 * What Reemite support can do on a group: freeze it, and let it run again once an incident is
 * resolved. Support never moves a group's money by hand — every movement stays a rule the
 * members signed.
 */
export class LikilibaAdminService {
  static async suspend(
    internalUserId: number,
    likilibaId: number,
    reason: string,
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      if (likiliba.status !== 'active') {
        throw new LikilibaException(
          'Only a running likiliba can be suspended',
          'INVALID_STATE',
          409
        )
      }
      const actor: LikilibaActor = { type: 'internal_user', id: internalUserId }
      likiliba.status = 'suspended'
      likiliba.suspendedAt = DateTime.now()
      likiliba.suspensionReason = reason
      await likiliba.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor,
        eventType: 'suspended_by_support',
        payload: { reason },
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
          message: `Le support Reemite a suspendu « ${likiliba.name} » : ${reason}. Aucun versement n'aura lieu jusqu'à la reprise ; les cotisations restent possibles.`,
          correlationId,
        },
        trx
      )
      return likiliba
    })
  }

  /** Resumes a suspended group. An escalated round goes back to waiting, with a fresh delay. */
  static async resume(
    internalUserId: number,
    likilibaId: number,
    note: string,
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      if (likiliba.status !== 'suspended') {
        throw new LikilibaException('This likiliba is not suspended', 'INVALID_STATE', 409)
      }
      const actor: LikilibaActor = { type: 'internal_user', id: internalUserId }
      const now = DateTime.now()

      const escalated = await LikilibaRound.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .where('status', 'escalated')
        .forUpdate()
      for (const round of escalated) {
        round.status = 'waiting_funds'
        round.waitingSince = now
        await round.useTransaction(trx).save()
      }

      likiliba.status = 'active'
      likiliba.suspendedAt = null
      likiliba.suspensionReason = null
      await likiliba.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor,
        eventType: 'resumed_by_support',
        payload: { note },
        correlationId,
        trx,
      })
      const members = await membersOf(likiliba, trx)
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: members.map((m) => m.userId),
          type: 'resumed',
          title: 'Likiliba reprise',
          message: `« ${likiliba.name} » reprend son cours. ${note}`,
          correlationId,
        },
        trx
      )

      const { LikilibaContributionService } =
        await import('#services/likiliba/contribution_service')
      const { LikilibaPayoutService } = await import('#services/likiliba/payout_service')
      const round = await LikilibaContributionService.currentRound(likiliba, trx)
      await LikilibaPayoutService.tryPayout(likiliba, round, correlationId, trx)
      return likiliba
    })
  }
}

/**
 * The pot holds the open round's money and nothing else: what was paid in or covered for the
 * round not yet paid out. Zero before the cycle starts and after it ends. Wallet-versus-ledger
 * drift is ReconciliationService's job; this checks that the pot agrees with the contributions.
 */
export class LikilibaReconciliationService {
  static async checkPots() {
    const mismatches: Array<{ likilibaId: number; code: string; pot: bigint; expected: bigint }> =
      []
    const groups = await Likiliba.query().whereNotNull('potWalletId')
    for (const likiliba of groups) {
      const pot = await LikilibaLedger.balanceOf(likiliba.potWalletId!)
      const open = await LikilibaRound.query()
        .where('likilibaId', likiliba.id)
        .whereNot('status', 'paid_out')
        .select('id')
      const rows = open.length
        ? await LikilibaContribution.query()
            .whereIn(
              'roundId',
              open.map((r) => r.id)
            )
            .whereIn('status', ['confirmed', 'covered'])
        : []
      const expected = rows.reduce((s, c) => s + c.amount, 0n)
      if (pot !== expected) {
        const mismatch = { likilibaId: likiliba.id, code: likiliba.code, pot, expected }
        mismatches.push(mismatch)
        console.error(`[CRITICAL] Likiliba pot mismatch:`, {
          ...mismatch,
          pot: pot.toString(),
          expected: expected.toString(),
        })
      }
    }
    return mismatches
  }
}
