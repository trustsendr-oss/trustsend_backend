import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type User from '#models/user'
import { formatAmount } from '#services/notifications/transaction_notifier'
import { LikilibaLedger } from '#services/likiliba/likiliba_ledger'
import { LikilibaJournal } from '#services/likiliba/journal'
import { LikilibaNotifier } from '#services/likiliba/notifier'
import { LikilibaRules } from '#services/likiliba/rules'
import { displayName, LikilibaService, membersOf } from '#services/likiliba/likiliba_service'
import { LikilibaException, lockGroup } from '#services/likiliba/shared'

/**
 * A member's own commitments: signing the final rules (PIN checked by the caller), locking the
 * caution, and the automatic-debit mandate.
 */
export class LikilibaMembershipService {
  /**
   * Signs the group's current rules. `rulesHash` is the hash of the version the member was shown:
   * if the rules changed in between, the signature is refused instead of applying to text they
   * never read.
   */
  static async commit(
    user: User,
    likilibaId: number,
    params: { rulesHash: string; autoDebit: boolean; idempotencyKey?: string },
    correlationId: string
  ) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      const member = await LikilibaService.memberOf(likiliba, user.id, trx)
      if (likiliba.status !== 'locked') {
        throw new LikilibaException(
          'The rules can be signed once the group is complete and locked',
          'INVALID_STATE',
          409
        )
      }
      if (member.status !== 'admitted') {
        throw new LikilibaException('You have already signed these rules', 'ALREADY_SIGNED', 409)
      }
      const rules = await LikilibaRules.current(likiliba, trx)
      if (!rules || rules.rulesHash !== params.rulesHash) {
        throw new LikilibaException(
          'The rules changed since you read them; read the current version before signing',
          'RULES_CHANGED',
          409
        )
      }

      let cautionTransactionId: string | null = null
      if (likiliba.cautionRequired) {
        const amount = likiliba.cautionAmount
        const wallets = await LikilibaLedger.lockWallets([member.walletId], trx)
        await LikilibaLedger.assertCanDebit(wallets.get(member.walletId)!, amount, trx)
        if (!member.cautionWalletId) {
          const caution = await LikilibaLedger.createCautionWallet(likiliba, user.id, trx)
          member.cautionWalletId = caution.id
        }
        const txn = await LikilibaLedger.post({
          type: 'likiliba_caution_lock',
          likiliba,
          legs: [
            { walletId: member.walletId, direction: 'debit', amount },
            { walletId: member.cautionWalletId, direction: 'credit', amount },
          ],
          actor: { type: 'user', id: user.id },
          description: `Likiliba ${likiliba.code}: caution locked`,
          metadata: { member_id: member.id, rule_version_id: rules.id },
          correlationId,
          idempotencyKey: params.idempotencyKey,
          trx,
        })
        cautionTransactionId = txn.id
      }

      const now = DateTime.now()
      member.status = 'committed'
      member.acceptedRuleVersionId = rules.id
      member.rulesAcceptedAt = now
      member.autoDebit = params.autoDebit
      member.mandateGrantedAt = params.autoDebit ? now : null
      member.mandateRevokedAt = null
      await member.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: 'rules_signed',
        memberId: member.id,
        payload: {
          rule_version: rules.version,
          rules_hash: rules.rulesHash,
          auto_debit: params.autoDebit,
          caution_amount: likiliba.cautionAmount,
          caution_transaction_id: cautionTransactionId,
        },
        correlationId,
        trx,
      })

      const caution = formatAmount(likiliba.cautionAmount, likiliba.currencyCode)
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [user.id],
          type: 'rules_signed',
          title: 'Règles signées',
          message:
            `Vous avez signé les règles de « ${likiliba.name} » (version ${rules.version}).` +
            (likiliba.cautionRequired
              ? ` Votre caution de ${caution} est bloquée jusqu'à la fin du cycle.`
              : '') +
            (params.autoDebit ? ' Le prélèvement automatique est activé.' : ''),
          data: { rule_version: rules.version, caution_transaction_id: cautionTransactionId },
          email: cautionTransactionId
            ? {
                subject: `Caution bloquée — ${caution}`,
                title: 'Caution bloquée',
                sentence: `Votre caution pour la likiliba « ${likiliba.name} » est bloquée jusqu'à la fin du cycle. Elle reste à votre nom.`,
                caption: 'Caution',
                amount: caution,
                direction: 'out',
                rows: [
                  ['Likiliba', `${likiliba.name} (${likiliba.code})`],
                  ['Débité de', `Compte ${likiliba.currencyCode}`],
                  ['Règles signées', `version ${rules.version}`],
                ],
                reference: cautionTransactionId,
              }
            : undefined,
          correlationId,
        },
        trx
      )

      const members = await membersOf(likiliba, trx)
      const signed = members.filter((m) => m.status === 'committed').length
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [likiliba.creatorUserId].filter((id) => id !== user.id),
          type: 'member_signed',
          title: 'Signature reçue',
          message:
            `${displayName(user)} a signé les règles de « ${likiliba.name} » (${signed}/${likiliba.size}).` +
            (signed === likiliba.size
              ? ' Tout le monde a signé : vous pouvez démarrer le cycle.'
              : ''),
          correlationId,
        },
        trx
      )
      return member
    })
  }

  /** Grants or revokes the automatic-debit mandate. Revoking never removes the obligation to pay. */
  static async setMandate(user: User, likilibaId: number, enabled: boolean, correlationId: string) {
    return db.transaction(async (trx) => {
      const likiliba = await lockGroup(likilibaId, trx)
      const member = await LikilibaService.memberOf(likiliba, user.id, trx)
      if (
        !['locked', 'active', 'suspended'].includes(likiliba.status) ||
        member.status === 'admitted'
      ) {
        throw new LikilibaException(
          'The mandate is set when signing the rules',
          'INVALID_STATE',
          409
        )
      }
      if (member.autoDebit === enabled) return member

      member.autoDebit = enabled
      if (enabled) {
        member.mandateGrantedAt = DateTime.now()
        member.mandateRevokedAt = null
      } else {
        member.mandateRevokedAt = DateTime.now()
      }
      await member.useTransaction(trx).save()

      await LikilibaJournal.record({
        likiliba,
        actor: { type: 'user', id: user.id },
        eventType: enabled ? 'mandate_granted' : 'mandate_revoked',
        memberId: member.id,
        correlationId,
        trx,
      })
      await LikilibaNotifier.notify(
        likiliba,
        {
          userIds: [user.id],
          type: enabled ? 'mandate_granted' : 'mandate_revoked',
          title: enabled ? 'Prélèvement automatique activé' : 'Prélèvement automatique révoqué',
          message: enabled
            ? `Vos cotisations à « ${likiliba.name} » seront prélevées automatiquement à chaque échéance.`
            : `Le prélèvement automatique est révoqué pour « ${likiliba.name} ». Vous devez désormais payer chaque cotisation vous-même avant la fin du délai de grâce.`,
          correlationId,
        },
        trx
      )
      return member
    })
  }
}
