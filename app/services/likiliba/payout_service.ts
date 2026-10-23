import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaContribution from '#models/likiliba_contribution'
import type LikilibaDebt from '#models/likiliba_debt'
import LikilibaRound from '#models/likiliba_round'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger, type LikilibaLeg } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { LikilibaRules } from '#services/likiliba/rules'
import { LikilibaDebtService } from '#services/likiliba/debt_service'
import { displayName, membersOf } from '#services/likiliba/likiliba_service'
import { bpsOf, SYSTEM_ACTOR } from '#services/likiliba/shared'

/**
 * Money leaving the pot: the beneficiary's payout, and at the end of the cycle the cautions.
 * Only the system pays out — no member, organiser included, can trigger a transfer to anyone.
 */
export class LikilibaPayoutService {
  /**
   * Pays the round if, and only if, it is complete: the due date is reached, every share is in
   * the pot (paid or covered), and the pot holds exactly that. Otherwise nothing happens.
   */
  static async tryPayout(
    likiliba: Likiliba,
    round: LikilibaRound,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ): Promise<boolean> {
    if (likiliba.status !== 'active') return false
    if (round.status !== 'collecting' && round.status !== 'waiting_funds') return false
    if (now < round.dueAt) return false

    const contributions = await LikilibaContribution.query({ client: trx })
      .where('roundId', round.id)
      .forUpdate()
    if (contributions.some((c) => !c.isSettledInPot)) return false

    const expected = contributions
      .filter((c) => c.status === 'confirmed' || c.status === 'covered')
      .reduce((s, c) => s + c.amount, 0n)
    const pot = await LikilibaLedger.balanceOf(likiliba.potWalletId!, trx)
    if (pot !== expected || expected !== likiliba.roundAmount) {
      // The pot must hold exactly what the confirmed contributions say. Anything else is an
      // integrity problem to investigate, never something to pay through.
      console.error(
        `[CRITICAL] Likiliba ${likiliba.code} round ${round.number}: pot ${pot}, expected ${expected}`
      )
      await LikilibaJournal.record({
        likiliba,
        actor: SYSTEM_ACTOR,
        eventType: 'pot_mismatch',
        payload: { round: round.number, pot, expected, round_amount: likiliba.roundAmount },
        correlationId,
        trx,
      })
      return false
    }

    const rules = await LikilibaRules.current(likiliba, trx)
    const gross = pot
    const commission = bpsOf(gross, rules ? LikilibaRules.commissionBpsOf(rules) : 0)

    const members = await membersOf(likiliba, trx)
    const byId = new Map(members.map((m) => [m.id, m]))
    const beneficiary = byId.get(round.beneficiaryMemberId)!

    // The beneficiary's own debts to the group are settled out of their payout first.
    const debts = await LikilibaDebtService.openDebtsOf(beneficiary.id, trx)
    const allocations = await LikilibaDebtService.allocate(debts, gross - commission, trx)
    const withheld = allocations.reduce((s, a) => s + a.amount, 0n)
    const net = gross - commission - withheld

    const legs: LikilibaLeg[] = [
      { walletId: likiliba.potWalletId!, direction: 'debit', amount: gross },
      ...LikilibaDebtService.legsFor(allocations),
      { walletId: beneficiary.walletId, direction: 'credit', amount: net },
    ]
    const txn = await LikilibaLedger.post({
      type: 'likiliba_payout',
      likiliba,
      legs,
      commission,
      actor: SYSTEM_ACTOR,
      description: `Likiliba ${likiliba.code}: round ${round.number} payout`,
      metadata: {
        round: round.number,
        beneficiary_member_id: beneficiary.id,
        gross: gross.toString(),
        commission: commission.toString(),
        withheld: withheld.toString(),
        net: net.toString(),
      },
      correlationId,
      trx,
    })
    await LikilibaDebtService.applyAllocations(allocations, trx)

    round.status = 'paid_out'
    round.grossAmount = gross
    round.commissionAmount = commission
    round.withheldAmount = withheld
    round.netAmount = net
    round.payoutTransactionId = txn.id
    round.paidOutAt = now
    await round.useTransaction(trx).save()
    beneficiary.paidOutAt = now
    await beneficiary.useTransaction(trx).save()

    // A round paid after its grace period pushes back every round still to come.
    let shiftedBy: number | null = null
    if (now > round.graceEndsAt) {
      const delay = now.diff(round.dueAt)
      shiftedBy = delay.toMillis()
      const later = await LikilibaRound.query({ client: trx })
        .where('likilibaId', likiliba.id)
        .where('status', 'scheduled')
        .forUpdate()
      for (const next of later) {
        next.dueAt = next.dueAt.plus(delay)
        next.graceEndsAt = next.graceEndsAt.plus(delay)
        await next.useTransaction(trx).save()
      }
    }

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'payout_completed',
      memberId: beneficiary.id,
      payload: {
        round: round.number,
        gross,
        commission,
        withheld,
        net,
        transaction_id: txn.id,
        calendar_shifted_ms: shiftedBy,
      },
      correlationId,
      trx,
    })

    const cur = likiliba.currencyCode
    const fmt = (v: bigint) => formatAmount(v, cur)
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: [beneficiary.userId],
        type: 'payout_received',
        title: 'Vous avez reçu la cagnotte',
        message:
          `Tour ${round.number} de « ${likiliba.name} » : ${fmt(net)} versés sur votre compte ${cur} ` +
          `(brut ${fmt(gross)}, commission Reemite ${fmt(commission)}` +
          (withheld > 0n ? `, retenue pour vos dettes ${fmt(withheld)}` : '') +
          ').',
        data: { round: round.number, transaction_id: txn.id, net: net.toString() },
        email: {
          subject: `Likiliba : vous avez reçu ${fmt(net)}`,
          title: 'Versement reçu',
          sentence: `C'était votre tour dans la likiliba « ${likiliba.name} » : la cagnotte vous a été versée.`,
          caption: 'Montant net reçu',
          amount: fmt(net),
          direction: 'in',
          rows: [
            ['Likiliba', `${likiliba.name} (${likiliba.code})`],
            ['Tour', String(round.number)],
            ['Montant brut', fmt(gross)],
            ['Commission Reemite', fmt(commission)],
            ['Retenue pour dettes', withheld > 0n ? fmt(withheld) : null],
            ['Crédité sur', `Compte ${cur}`],
          ],
          reference: txn.id,
        },
        correlationId,
      },
      trx
    )
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: members.filter((m) => m.id !== beneficiary.id).map((m) => m.userId),
        type: 'payout_completed',
        title: `Tour ${round.number} versé`,
        message:
          `${displayName(beneficiary.user)} a reçu la cagnotte du tour ${round.number} de « ${likiliba.name} » (${fmt(gross)} brut, commission ${fmt(commission)}).` +
          (shiftedBy
            ? " Le versement ayant eu lieu en retard, les tours suivants sont décalés d'autant."
            : ''),
        data: { round: round.number },
        correlationId,
      },
      trx
    )
    if (allocations.length > 0) {
      await LikilibaDebtService.notifyCreditors(
        likiliba,
        allocations,
        displayName(beneficiary.user),
        'sur son versement',
        correlationId,
        trx
      )
    }

    const next = await LikilibaRound.query({ client: trx })
      .where('likilibaId', likiliba.id)
      .where('number', round.number + 1)
      .forUpdate()
      .first()
    if (next) {
      likiliba.currentRoundNumber = next.number
      await likiliba.useTransaction(trx).save()
      const { LikilibaContributionService } =
        await import('#services/likiliba/contribution_service')
      await LikilibaContributionService.openRound(likiliba, next, correlationId, trx, now)
    } else {
      await this.completeCycle(likiliba, correlationId, trx, now)
    }
    return true
  }

  /**
   * Every member has received. Debts still open are taken from the debtor's caution; what that
   * cannot cover is written off — borne by the cautions that advanced it, as the rules say. Then
   * every caution is released to its owner.
   */
  static async completeCycle(
    likiliba: Likiliba,
    correlationId: string,
    trx: TransactionClientContract,
    now = DateTime.now()
  ) {
    const members = await membersOf(likiliba, trx)
    const byId = new Map(members.map((m) => [m.id, m]))
    const writtenOff: Array<{ debtor: number; creditor: number; amount: bigint }> = []

    for (const member of members) {
      const debts = await LikilibaDebtService.openDebtsOf(member.id, trx)
      if (debts.length === 0) continue

      // An advance from one's own caution cannot be repaid out of that same caution: it was
      // already spent, and is simply closed.
      const toOthers: LikilibaDebt[] = []
      for (const debt of debts) {
        if (debt.creditorMemberId === member.id) {
          debt.status = 'written_off'
          debt.remaining = 0n
          debt.settledAt = now
          await debt.useTransaction(trx).save()
        } else {
          toOthers.push(debt)
        }
      }

      const caution = member.cautionWalletId
        ? await LikilibaLedger.balanceOf(member.cautionWalletId, trx)
        : 0n
      const allocations = await LikilibaDebtService.allocate(toOthers, caution, trx)
      const total = allocations.reduce((s, a) => s + a.amount, 0n)
      if (total > 0n) {
        await LikilibaLedger.post({
          type: 'likiliba_debt_repayment',
          likiliba,
          legs: [
            { walletId: member.cautionWalletId!, direction: 'debit', amount: total },
            ...LikilibaDebtService.legsFor(allocations),
          ],
          actor: SYSTEM_ACTOR,
          description: `Likiliba ${likiliba.code}: debts settled from caution at the end of the cycle`,
          metadata: { member_id: member.id, debts: allocations.map((a) => a.debt.id) },
          correlationId,
          trx,
        })
        await LikilibaDebtService.applyAllocations(allocations, trx)
        await LikilibaDebtService.notifyCreditors(
          likiliba,
          allocations,
          displayName(member.user),
          'sur sa caution en fin de cycle',
          correlationId,
          trx
        )
      }

      for (const debt of toOthers) {
        if (debt.status !== 'open') continue
        writtenOff.push({
          debtor: member.id,
          creditor: debt.creditorMemberId,
          amount: debt.remaining,
        })
        debt.status = 'written_off'
        debt.settledAt = now
        await debt.useTransaction(trx).save()
      }
    }

    for (const member of members) {
      if (member.cautionWalletId) {
        const balance = await LikilibaLedger.balanceOf(member.cautionWalletId, trx)
        if (balance > 0n) {
          const txn = await LikilibaLedger.post({
            type: 'likiliba_caution_release',
            likiliba,
            legs: [
              { walletId: member.cautionWalletId, direction: 'debit', amount: balance },
              { walletId: member.walletId, direction: 'credit', amount: balance },
            ],
            actor: SYSTEM_ACTOR,
            description: `Likiliba ${likiliba.code}: caution released`,
            metadata: { member_id: member.id },
            correlationId,
            trx,
          })
          const amount = formatAmount(balance, likiliba.currencyCode)
          await LikilibaNotifier.notify(
            likiliba,
            {
              userIds: [member.userId],
              type: 'caution_released',
              title: 'Caution rendue',
              message: `Le cycle de « ${likiliba.name} » est terminé : ${amount} de caution ont été rendus sur votre compte ${likiliba.currencyCode}.`,
              data: { transaction_id: txn.id },
              email: {
                subject: `Caution rendue — ${amount}`,
                title: 'Caution rendue',
                sentence: `Le cycle de la likiliba « ${likiliba.name} » est terminé : votre caution vous est rendue.`,
                caption: 'Montant rendu',
                amount,
                direction: 'in',
                rows: [
                  ['Likiliba', `${likiliba.name} (${likiliba.code})`],
                  ['Caution bloquée', formatAmount(likiliba.cautionAmount, likiliba.currencyCode)],
                  ['Crédité sur', `Compte ${likiliba.currencyCode}`],
                ],
                reference: txn.id,
              },
              correlationId,
            },
            trx
          )
        }
      }
      member.status = 'completed'
      await member.useTransaction(trx).save()
    }

    likiliba.status = 'completed'
    likiliba.completedAt = now
    await likiliba.useTransaction(trx).save()

    await LikilibaJournal.record({
      likiliba,
      actor: SYSTEM_ACTOR,
      eventType: 'completed',
      payload: { written_off: writtenOff },
      correlationId,
      trx,
    })
    await LikilibaNotifier.notify(
      likiliba,
      {
        userIds: members.map((m) => m.userId),
        type: 'completed',
        title: 'Cycle terminé',
        message:
          `Tous les membres de « ${likiliba.name} » ont reçu leur tour. Le cycle est terminé.` +
          (writtenOff.length > 0
            ? ` ${writtenOff.length} dette(s) restée(s) impayée(s) sont détaillées dans l'historique du groupe.`
            : ''),
        correlationId,
      },
      trx
    )
    for (const loss of writtenOff) {
      const creditor = byId.get(loss.creditor)
      const debtor = byId.get(loss.debtor)
      if (!creditor || !debtor) continue
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [creditor.userId],
          type: 'debt_written_off',
          title: 'Dette impayée',
          message: `${displayName(debtor.user)} n'a pas remboursé ${formatAmount(loss.amount, likiliba.currencyCode)} dans « ${likiliba.name} », et sa caution ne suffisait pas. Vous pouvez ouvrir un litige auprès du support Reemite.`,
          correlationId,
        },
        trx
      )
    }
  }
}
