import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { NotificationService } from '#services/notifications/notification_service'

/** One alert of a kind and subject at most this often: the team needs a signal, not a flood. */
const THROTTLE_MS = 60 * 60_000
const lastSent = new Map<string, number>()

export type CryptoAlertKind =
  | 'payout_review' // a withdrawal waits for staff
  | 'payout_flagged' // the chain contradicts a recorded hash
  | 'payout_broadcast_failed' // the hot wallet could not reach the network
  | 'hot_wallet_insufficient' // not enough tokens or fee coin to send
  | 'hot_wallet_gas_low' // fee coin below its minimum
  | 'deposit_rejected' // a reported deposit the chain does not support
  | 'webhook_missed' // the reconciliation recovered deposits no webhook reported
  | 'withdrawal_fraud_hold' // a withdrawal held back by an anti-fraud rule

/**
 * E-mails the team when crypto money needs a human (CRYPTO_ALERT_EMAILS, comma-separated).
 * Never throws and never blocks the money flow that raised it: an alert lost is a log line,
 * a crash would be a withdrawal not sent.
 */
export class CryptoAlerts {
  static recipients(): string[] {
    return (env.get('CRYPTO_ALERT_EMAILS', '') ?? '')
      .split(',')
      .map((address) => address.trim())
      .filter((address) => address.includes('@'))
  }

  /**
   * `subject` deduplicates within a kind (a payout id, a network…): the same alert is sent at
   * most once an hour, another subject goes out right away.
   */
  static raise(
    kind: CryptoAlertKind,
    subject: string,
    title: string,
    message: string,
    details: Record<string, string | number | null | undefined> = {}
  ) {
    logger.warn({ alert: kind, subject, ...details }, message)

    const key = `${kind}:${subject}`
    const now = Date.now()
    if ((lastSent.get(key) ?? 0) > now - THROTTLE_MS) return
    lastSent.set(key, now)

    for (const to of CryptoAlerts.recipients()) {
      void NotificationService.sendEmail({
        to,
        subject: `[Reemite crypto] ${title}`,
        template: 'ops_alert',
        data: { title, message, details },
      }).catch((error) => logger.error({ err: error, alert: kind }, 'crypto alert e-mail failed'))
    }
  }

  /** Tests: forget what was sent, so each test sees its own alerts. */
  static reset() {
    lastSent.clear()
  }
}
