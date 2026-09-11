import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Agent from '#models/agent'
import Business from '#models/business'
import User from '#models/user'
import Wallet from '#models/wallet'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { NotificationService } from '#services/notifications/notification_service'

/**
 * Turns a money movement into something a person actually receives.
 *
 * Resolving "who gets told" is not obvious: a wallet belongs to a user, an agent OR a business
 * (see the `wallets_single_owner` check constraint), and each of those keeps its address in its
 * own table. Every notification path needed that lookup, so it lives here once.
 *
 * In-app rows and e-mails are dispatched from different places on purpose. An in-app row is a
 * local INSERT that belongs in the same database transaction as the movement — the mobile money
 * services already write theirs inline. An e-mail is an outbound SMTP call that can fail, hang,
 * or need a retry; it must not sit inside a financial transaction, which is why it is dispatched
 * from the outbox relay instead.
 */

export type NotificationRecipient = {
  type: 'user' | 'agent' | 'business'
  id: number
  email: string
  /** Display name, for the greeting. Falls back to the address when unnamed. */
  name: string
}

/** Currencies with no minor unit — the stored integer is already the displayed amount. */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

/**
 * Minor units → a readable amount. An unknown currency is treated as having a minor unit:
 * showing "12,50" for a currency that has none is a cosmetic error, while dropping two decimals
 * from one that does multiplies the amount by a hundred.
 */
export function formatAmount(minor: string | bigint | number, currencyCode: string): string {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currencyCode.toUpperCase()) ? 0 : 2
  const digits = BigInt(minor ?? 0)
  const negative = digits < 0n
  const absolute = (negative ? -digits : digits).toString().padStart(decimals + 1, '0')

  const whole = absolute.slice(0, absolute.length - decimals) || '0'
  const fraction = decimals > 0 ? absolute.slice(absolute.length - decimals) : ''
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  const amount = fraction ? `${grouped},${fraction}` : grouped
  return `${negative ? '-' : ''}${amount} ${currencyCode}`
}

export class TransactionNotifier {
  /** The owner of a wallet, whoever they are. `null` when the wallet or the owner is gone. */
  static async recipientForWallet(
    walletId: number | string
  ): Promise<NotificationRecipient | null> {
    const wallet = await Wallet.find(walletId)
    if (!wallet) return null

    if (wallet.userId) {
      const user = await User.find(wallet.userId)
      return user
        ? { type: 'user', id: user.id, email: user.email, name: user.fullName || user.email }
        : null
    }

    if (wallet.agentId) {
      const agent = await Agent.find(wallet.agentId)
      return agent
        ? {
            type: 'agent',
            id: agent.id,
            email: agent.email,
            name: agent.businessName || agent.fullName || agent.email,
          }
        : null
    }

    if (wallet.businessId) {
      const business = await Business.find(wallet.businessId)
      return business
        ? {
            type: 'business',
            id: business.id,
            email: business.email,
            name: business.name || business.email,
          }
        : null
    }

    return null
  }

  /** The party a transaction was initiated by, from `initiated_by_type` / `initiated_by_id`. */
  static async recipientForActor(type: string, id: number): Promise<NotificationRecipient | null> {
    if (type === 'user') {
      const user = await User.find(id)
      return user
        ? { type: 'user', id: user.id, email: user.email, name: user.fullName || user.email }
        : null
    }
    if (type === 'agent') {
      const agent = await Agent.find(id)
      return agent
        ? {
            type: 'agent',
            id: agent.id,
            email: agent.email,
            name: agent.businessName || agent.fullName || agent.email,
          }
        : null
    }
    if (type === 'business') {
      const business = await Business.find(id)
      return business
        ? {
            type: 'business',
            id: business.id,
            email: business.email,
            name: business.name || business.email,
          }
        : null
    }
    // 'system' and 'internal_user' are not people to notify.
    return null
  }

  /**
   * Sends one transactional e-mail.
   *
   * Throws when the mailer refuses, so the outbox relay records the attempt and retries rather
   * than marking the event delivered. `NotificationService.sendEmail` swallows its own errors and
   * returns `false`, which would otherwise look like success from here.
   */
  static async email(
    recipient: NotificationRecipient,
    subject: string,
    template: string,
    data: Record<string, any>
  ): Promise<void> {
    if (!recipient.email) return

    const sent = await NotificationService.sendEmail({
      to: recipient.email,
      subject,
      template,
      data: { name: recipient.name, ...data },
    })

    if (!sent) {
      throw new Error(`Email dispatch failed for ${recipient.type}#${recipient.id}`)
    }
  }

  /**
   * Records that a movement reached a state worth an e-mail.
   *
   * Written as an outbox event rather than sent on the spot, and inside the caller's transaction
   * when there is one: an SMTP call has no business inside a database transaction that is holding
   * locks on wallet rows, and a transaction that rolls back must not leave an e-mail already
   * gone. The outbox relay picks it up moments later — see app/jobs/outbox_relay_job.ts.
   */
  static async enqueueEmail(
    transaction: { id: string; correlationId: string },
    eventType: string,
    trx?: TransactionClientContract
  ): Promise<void> {
    const query = db.table('outbox_events')
    if (trx) query.useTransaction(trx)

    await query.insert({
      aggregate_type: 'ledger_transaction',
      aggregate_id: transaction.id,
      event_type: eventType,
      payload: { transaction_id: transaction.id, correlation_id: transaction.correlationId },
      status: 'pending',
      created_at: new Date(),
    })
  }

  /** Writes the in-app row that powers the notifications screen. */
  static async inApp(
    recipient: NotificationRecipient,
    params: { type: string; title: string; message: string; data?: Record<string, any> }
  ): Promise<void> {
    await InAppNotificationService.notify({
      recipientType: recipient.type,
      recipientId: recipient.id,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data,
    })
  }
}
