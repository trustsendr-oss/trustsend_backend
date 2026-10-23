import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Likiliba from '#models/likiliba'
import LikilibaDebt from '#models/likiliba_debt'
import LikilibaMember from '#models/likiliba_member'
import LikilibaPenalty from '#models/likiliba_penalty'
import type User from '#models/user'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger, type LikilibaLeg } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { LikilibaService } from '#services/likiliba/likiliba_service'
import { LikilibaException, lockGroup, type LikilibaActor } from '#services/likiliba/shared'

export type DebtAllocation = { debt: LikilibaDebt; amount: bigint; creditorWalletId: number }

/**
 * What members owe inside the group, and every way it gets repaid: by the member, out of their
 * own payout, or out of their caution at the end of the cycle.
 */
export class LikilibaDebtService {
  static async openDebtsOf(memberId: number, trx: TransactionClientContract) {
    return LikilibaDebt.query({ client: trx })
      .where('debtorMemberId', memberId)
      .where('status', 'open')
      .orderBy('id', 'asc')
      .forUpdate()
  }

  static async totalOwedBy(memberId: number, trx?: TransactionClientContract): Promise<bigint> {
    const query = db
      .from('likiliba_debts')
      .where('debtor_member_id', memberId)
      .where('status', 'open')
    if (trx) query.useTransaction(trx)
    const row = await query.sum('remaining as total').first()
    return BigInt(row?.total ?? 0)
  }

  /**
   * Where repaying a debt sends the money: back into the caution that advanced it, or to the
   * beneficiary a penalty was owed to.
   */
  static async creditorWalletOf(
    debt: LikilibaDebt,
    trx: TransactionClientContract
  ): Promise<number> {
    const creditor = await LikilibaMember.findOrFail(debt.creditorMemberId, { client: trx })
    if (debt.origin === 'caution_cover') {
      if (!creditor.cautionWalletId) throw new Error(`Member ${creditor.id} has no caution wallet`)
      return creditor.cautionWalletId
    }
    return creditor.walletId
  }

  /** Oldest debts first, as far as `available` goes. */
  static async allocate(
    debts: LikilibaDebt[],
    available: bigint,
    trx: TransactionClientContract
  ): Promise<DebtAllocation[]> {
    const allocations: DebtAllocation[] = []
    let left = available
    for (const debt of debts) {
      if (left <= 0n) break
      const amount = debt.remaining < left ? debt.remaining : left
      allocations.push({ debt, amount, creditorWalletId: await this.creditorWalletOf(debt, trx) })
      left -= amount
    }
    return allocations
  }

  static legsFor(allocations: DebtAllocation[]): LikilibaLeg[] {
    return allocations.map((a) => ({
      walletId: a.creditorWalletId,
      direction: 'credit',
      amount: a.amount,
    }))
  }

  /** Books repayments once their transaction has posted. Settled penalty debts settle the penalty. */
  static async applyAllocations(allocations: DebtAllocation[], trx: TransactionClientContract) {
    const now = DateTime.now()
    for (const { debt, amount } of allocations) {
      debt.remaining -= amount
      if (debt.remaining === 0n) {
        debt.status = 'settled'
        debt.settledAt = now
        if (debt.penaltyId) {
          await LikilibaPenalty.query({ client: trx })
            .where('id', debt.penaltyId)
            .update({ status: 'paid', settled_at: now.toJSDate(), updated_at: now.toJSDate() })
        }
      }
      await debt.useTransaction(trx).save()
    }
  }

  /** Tells each creditor what came back to them. */
  static async notifyCreditors(
    likiliba: Likiliba,
    allocations: DebtAllocation[],
    debtorName: string,
    how: string,
    correlationId: string,
    trx: TransactionClientContract
  ) {
    const byCreditor = new Map<number, { caution: bigint; penalty: bigint }>()
    for (const a of allocations) {
      const entry = byCreditor.get(a.debt.creditorMemberId) ?? { caution: 0n, penalty: 0n }
      if (a.debt.origin === 'caution_cover') entry.caution += a.amount
      else entry.penalty += a.amount
      byCreditor.set(a.debt.creditorMemberId, entry)
    }
    for (const [creditorId, sums] of byCreditor) {
      const creditor = await LikilibaMember.findOrFail(creditorId, { client: trx })
      if (allocations.some((a) => a.debt.debtorMemberId === creditorId)) continue
      const parts: string[] = []
      if (sums.caution > 0n)
        parts.push(`${formatAmount(sums.caution, likiliba.currencyCode)} rendus à votre caution`)
      if (sums.penalty > 0n)
        parts.push(
          `${formatAmount(sums.penalty, likiliba.currencyCode)} de pénalités versés sur votre compte`
        )
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [creditor.userId],
          type: 'debt_repaid_to_you',
          title: 'Remboursement reçu',
          message: `${debtorName} a remboursé ${how} : ${parts.join(', ')} (« ${likiliba.name} »).`,
          correlationId,
        },
        trx
      )
    }
  }

  /** The member repays everything they owe in the group, from their primary wallet. */
  static async repay(
    user: User,
    likilibaId: number,
    correlationId: string,
    idempotencyKey?: string
  ) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      const member = await LikilibaService.memberOf(likiliba, user.id, trx)
      const debts = await this.openDebtsOf(member.id, trx)
      const total = debts.reduce((sum, d) => sum + d.remaining, 0n)
      if (total === 0n) {
        throw new LikilibaException('You owe nothing in this likiliba', 'NO_DEBT', 409)
      }

      const wallets = await LikilibaLedger.lockWallets([member.walletId], trx)
      await LikilibaLedger.assertCanDebit(wallets.get(member.walletId)!, total, trx)

      const allocations = await this.allocate(debts, total, trx)
      const actor: LikilibaActor = { type: 'user', id: user.id }
      const txn = await LikilibaLedger.post({
        type: 'likiliba_debt_repayment',
        likiliba,
        legs: [
          { walletId: member.walletId, direction: 'debit', amount: total },
          ...this.legsFor(allocations),
        ],
        actor,
        description: `Likiliba ${likiliba.code}: debt repaid`,
        metadata: {
          member_id: member.id,
          debts: allocations.map((a) => ({ id: a.debt.id, amount: a.amount.toString() })),
        },
        correlationId,
        idempotencyKey,
        trx,
      })
      await this.applyAllocations(allocations, trx)

      await LikilibaJournal.record({
        likiliba,
        actor,
        eventType: 'debt_repaid',
        memberId: member.id,
        payload: {
          amount: total,
          transaction_id: txn.id,
          debts: allocations.map((a) => a.debt.id),
        },
        correlationId,
        trx,
      })

      const amount = formatAmount(total, likiliba.currencyCode)
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [user.id],
          type: 'debt_repaid',
          title: 'Dette remboursée',
          message: `Vous avez remboursé ${amount} dans « ${likiliba.name} ». Vous ne devez plus rien au groupe ; les pénalités s'arrêtent.`,
          data: { transaction_id: txn.id },
          email: {
            subject: `Dette remboursée — ${amount}`,
            title: 'Dette remboursée',
            sentence: `Vous avez remboursé tout ce que vous deviez dans la likiliba « ${likiliba.name} ».`,
            caption: 'Montant remboursé',
            amount,
            direction: 'out',
            rows: [
              ['Likiliba', `${likiliba.name} (${likiliba.code})`],
              ['Débité de', `Compte ${likiliba.currencyCode}`],
              ['Frais', 'Gratuit'],
            ],
            reference: txn.id,
          },
          correlationId,
        },
        trx
      )
      await this.notifyCreditors(
        likiliba,
        allocations,
        user.fullName || 'Un membre',
        'sa dette',
        correlationId,
        trx
      )

      const { LikilibaPayoutService } = await import('#services/likiliba/payout_service')
      const { LikilibaDefaultService } = await import('#services/likiliba/default_service')
      if (likiliba.status === 'active' || likiliba.status === 'suspended') {
        // Restored cautions may now be enough to unblock a round waiting for funds.
        const { LikilibaContributionService } =
          await import('#services/likiliba/contribution_service')
        const round = await LikilibaContributionService.currentRound(likiliba, trx)
        await LikilibaDefaultService.retryCover(likiliba, round, correlationId, trx)
        await LikilibaPayoutService.tryPayout(likiliba, round, correlationId, trx)
      }
      return { amount: total, transactionId: txn.id }
    })
  }
}
