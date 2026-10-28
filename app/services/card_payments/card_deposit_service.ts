import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import CardDepositSession from '#models/card_deposit_session'
import LedgerTransaction from '#models/ledger_transaction'
import User from '#models/user'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import { Realtime } from '#services/realtime/realtime'
import {
  GoFreshPayRequestException,
  type BillTo,
  type CardDetails,
  type CardGateway,
} from '#services/card_payments/gofreshpay_gateway'

/**
 * Wallet top-up by bank card, through GoFreshPay's Microform (see gofreshpay_gateway.ts).
 *
 * Life of a top-up:
 *
 *   createSession ──► checkout page (card fields, 3DS) ──► setup ──► enroll ──┬──► charge
 *                                                                           └─ challenge (OTP) ─┘
 *
 * Nothing touches the ledger until `charge`: the ledger_transactions row (status `processing`)
 * is committed *before* the charge request leaves, so a charge whose answer is lost still has a
 * record to settle. Settlement then has exactly one entry point, `settle()`, reached from three
 * places that can race each other — the charge response, GoFreshPay's webhook and the
 * reconciliation sweep. It locks the session and the ledger row and is a no-op once either is
 * terminal, so a top-up is credited once whatever arrives first, twice, or out of order.
 *
 * Money movement on success (hundredths, `C` the card currency):
 *
 *   debit  CARD_CLEARING.C     amount   — what GoFreshPay now owes us for this charge
 *   credit user wallet         amount − fee
 *   credit PLATFORM_FEES.C     fee      — fee_schedules.card_deposit, only when > 0
 *
 * GoFreshPay's own commission is taken on their side when they settle to our bank account; it
 * shows up as the difference on CARD_CLEARING when that settlement is booked, exactly like
 * MOBILE_MONEY_CLEARING.
 *
 * Fraud rules (holds, limits, BIN checks) are deliberately not here yet — an internal decision is
 * pending. Every decision point they will need is already recorded on the session.
 */

export const CARD_DEPOSIT_CURRENCIES = ['USD', 'CDF'] as const

/** GoFreshPay's own minimums, in hundredths: 1.00 USD and 500 CDF. */
export const CARD_DEPOSIT_MINIMUMS: Record<string, bigint> = { USD: 100n, CDF: 50_000n }

/** How long the checkout page stays usable. CyberSource's capture context lasts 15 minutes. */
const SESSION_TTL_MINUTES = 15

/** A charge younger than this is left alone by the sweep: its own response may still be coming. */
const RECONCILE_GRACE_MINUTES = 2

export class CardDepositException extends Error {
  constructor(
    message: string,
    readonly code:
      | 'SESSION_NOT_FOUND'
      | 'SESSION_EXPIRED'
      | 'INVALID_STATE'
      | 'UNSUPPORTED_CURRENCY'
      | 'AMOUNT_TOO_LOW'
      | 'WALLET_UNAVAILABLE'
      | 'GATEWAY_UNAVAILABLE'
      | 'EMAIL_REQUIRED'
  ) {
    super(message)
    this.name = 'CardDepositException'
  }
}

/** What the checkout page sends next to the card: the parts of the billing identity we lack. */
export type BillingAddress = {
  addressLine1: string
  addressCity: string
  addressCountry: string
  phoneNumber: string
}

export type SettleOutcome = CardDetails & {
  status: 'SUCCESS' | 'FAILED'
  gatewayTransactionId?: string | null
  reasonCode?: string | null
  message?: string | null
  /** As reported by the gateway, when it reports them: checked against ours before crediting. */
  amountMajor?: string | null
  currencyCode?: string | null
  source: 'charge' | 'webhook' | 'reconciliation'
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function appUrl(): string {
  return env.get('APP_URL').replace(/\/$/, '')
}

/** The checkout page's URLs. The origin must be whitelisted on GoFreshPay's side. */
export const CardCheckoutUrls = {
  origin: () => new URL(appUrl()).origin,
  page: (sessionId: string) => `${appUrl()}/card-checkout/${sessionId}`,
  threeDsReturn: (sessionId: string) => `${appUrl()}/card-checkout/${sessionId}/3ds-return`,
  webhook: () => `${appUrl()}/api/v1/webhooks/gofreshpay`,
}

/** "Jean Kabala Mukendi" → Jean / Kabala Mukendi. A single word fills both, as banks require both. */
function splitName(fullName: string | null): { firstName: string; lastName: string } {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Client', lastName: 'Reemite' }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function majorToMinor(amountMajor: string): bigint | null {
  if (!/^\d+(\.\d{1,2})?$/.test(amountMajor)) return null
  const [whole, fraction = ''] = amountMajor.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export class CardDepositService {
  /* ------------------------------------------------------------------------ */
  /*                                 Session                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Starts a checkout. Returns the session and the one-time token the checkout page will
   * authenticate with; the token is shown once, only its hash is kept.
   */
  static async createSession(
    gateway: CardGateway,
    request: { user: User; amount: Money; correlationId: string }
  ): Promise<{ session: CardDepositSession; checkoutToken: string }> {
    const currencyCode = request.amount.currencyCode
    if (!(CARD_DEPOSIT_CURRENCIES as readonly string[]).includes(currencyCode)) {
      throw new CardDepositException(
        `Card top-ups are only available in ${CARD_DEPOSIT_CURRENCIES.join(' and ')}`,
        'UNSUPPORTED_CURRENCY'
      )
    }
    const minimum = CARD_DEPOSIT_MINIMUMS[currencyCode]
    if (request.amount.amount < minimum) {
      throw new CardDepositException(
        `The smallest card top-up is ${minimum} (hundredths of ${currencyCode})`,
        'AMOUNT_TOO_LOW'
      )
    }

    // The issuer's 3DS check and GoFreshPay both require one; better refused here than at the
    // last step of the checkout.
    if (!request.user.email) {
      throw new CardDepositException(
        'An e-mail address is required on your account to pay by card',
        'EMAIL_REQUIRED'
      )
    }

    const wallet = await Wallet.query()
      .withScopes((scope) => scope.primary())
      .where('user_id', request.user.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()
    if (!wallet) {
      throw new CardDepositException(
        `Active wallet not found for currency ${currencyCode}`,
        'WALLET_UNAVAILABLE'
      )
    }

    const sessionId = randomUUID()
    const merchantReference = `RMT-CD-${sessionId.replace(/-/g, '').slice(0, 20).toUpperCase()}`

    // The capture context is requested before anything is written: a gateway that is down leaves
    // no orphan session behind, and there is no DB transaction to hold open across the call.
    let context: Awaited<ReturnType<CardGateway['captureContext']>>
    try {
      context = await gateway.captureContext({
        targetOrigin: CardCheckoutUrls.origin(),
        merchantReference,
      })
    } catch (error) {
      logger.error({ err: error, merchantReference }, 'card deposit: capture-context failed')
      throw new CardDepositException(
        'Card payments are unavailable, try again',
        'GATEWAY_UNAVAILABLE'
      )
    }

    const checkoutToken = randomBytes(32).toString('base64url')
    const ttlMinutes = Math.min(
      SESSION_TTL_MINUTES,
      Math.floor(context.expiresInSeconds / 60) || SESSION_TTL_MINUTES
    )

    const session = await db.transaction(async (trx) => {
      const row = new CardDepositSession()
      row.id = sessionId
      row.userId = request.user.id
      row.walletId = wallet.id
      row.amount = request.amount.amount
      row.currencyCode = currencyCode
      row.merchantReference = merchantReference
      row.gatewayTransactionUuid = context.transactionUuid
      row.checkoutTokenHash = hashToken(checkoutToken)
      row.status = 'created'
      row.expiresAt = DateTime.now().plus({ minutes: ttlMinutes })
      // The capture context is handed to the browser anyway (it initialises the card fields):
      // not a secret, only short-lived.
      row.metadata = { capture_context: context.jwt, correlation_id: request.correlationId }
      await row.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: request.user.id,
        action: 'card_deposit.session.created',
        resourceType: 'card_deposit_session',
        resourceId: row.id,
        after: {
          amount: row.amount.toString(),
          currency_code: currencyCode,
          wallet_id: wallet.id,
          merchant_reference: merchantReference,
          gateway_transaction_uuid: context.transactionUuid,
        },
        correlationId: request.correlationId,
        trx,
      })
      return row
    })

    return { session, checkoutToken }
  }

  /** The session the checkout page is acting on, if its token is right and it is still open. */
  static async authenticateCheckout(sessionId: string, token: string | undefined | null) {
    if (!token || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
      throw new CardDepositException('Checkout session not found', 'SESSION_NOT_FOUND')
    }
    const session = await CardDepositSession.find(sessionId)
    if (!session) {
      throw new CardDepositException('Checkout session not found', 'SESSION_NOT_FOUND')
    }
    const expected = Buffer.from(session.checkoutTokenHash, 'hex')
    const received = Buffer.from(hashToken(token), 'hex')
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new CardDepositException('Checkout session not found', 'SESSION_NOT_FOUND')
    }
    return session
  }

  private static assertOpen(session: CardDepositSession, allowed: CardDepositSession['status'][]) {
    if (!allowed.includes(session.status)) {
      throw new CardDepositException(
        `This checkout is ${session.status}`,
        session.status === 'expired' ? 'SESSION_EXPIRED' : 'INVALID_STATE'
      )
    }
    if (session.expiresAt < DateTime.now()) {
      throw new CardDepositException('This checkout has expired', 'SESSION_EXPIRED')
    }
  }

  private static correlationId(session: CardDepositSession): string {
    return session.metadata?.correlation_id ?? session.merchantReference
  }

  /* ------------------------------------------------------------------------ */
  /*                               3D Secure                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Step 1 of 3DS, once the card fields produced a transient token: returns what the page needs
   * to run device data collection. Can be repeated (the cardholder corrected the card).
   */
  static async setup(gateway: CardGateway, session: CardDepositSession, transientToken: string) {
    this.assertOpen(session, ['created', 'authenticating'])
    try {
      const result = await gateway.paSetup({
        transientToken,
        transactionUuid: session.gatewayTransactionUuid!,
      })
      if (session.status !== 'authenticating') {
        session.status = 'authenticating'
        await session.save()
      }
      return result
    } catch (error) {
      logger.warn({ err: error, session: session.id }, 'card deposit: pa-setup failed')
      throw new CardDepositException(
        'Card authentication is unavailable, try again',
        'GATEWAY_UNAVAILABLE'
      )
    }
  }

  /**
   * Step 2 of 3DS. Frictionless → the charge is sent right away and its outcome returned.
   * Challenge → the page shows the issuer's OTP frame, then calls `charge`.
   */
  static async enroll(
    gateway: CardGateway,
    session: CardDepositSession,
    params: { transientToken: string; referenceId: string; billing: BillingAddress }
  ): Promise<
    | { next: 'challenge'; stepUpUrl: string; accessToken: string }
    | { next: 'done'; session: CardDepositSession }
  > {
    this.assertOpen(session, ['authenticating'])
    const billTo = await this.billToFor(session, params.billing)

    let result: Awaited<ReturnType<CardGateway['paEnroll']>>
    try {
      result = await gateway.paEnroll({
        transientToken: params.transientToken,
        transactionUuid: session.gatewayTransactionUuid!,
        referenceId: params.referenceId,
        amountMinor: session.amount,
        currencyCode: session.currencyCode,
        billTo,
        returnUrl: CardCheckoutUrls.threeDsReturn(session.id),
      })
    } catch (error) {
      logger.warn({ err: error, session: session.id }, 'card deposit: pa-enroll failed')
      throw new CardDepositException(
        'Card authentication is unavailable, try again',
        'GATEWAY_UNAVAILABLE'
      )
    }

    if (result.status === 'FAILED') {
      // Nothing was charged and nothing reached the ledger: the session alone records it.
      await this.failSession(session, result.reasonCode ?? '3DS_FAILED', result.message, '3ds')
      return { next: 'done', session }
    }

    session.authenticationTransactionId = result.authenticationTransactionId
    // Kept for the charge that follows a challenge. Address and phone only: no card data.
    session.metadata = { ...session.metadata, bill_to: params.billing }

    if (result.status === 'CHALLENGE_REQUIRED') {
      session.status = 'challenge'
      await session.save()
      return { next: 'challenge', stepUpUrl: result.stepUpUrl, accessToken: result.accessToken }
    }

    await session.save()
    return { next: 'done', session: await this.charge(gateway, session, params.transientToken) }
  }

  /** Records what the issuer's frame posted back after a challenge — for support, not trusted. */
  static async recordThreeDsReturn(sessionId: string, fields: Record<string, unknown>) {
    const session = await CardDepositSession.find(sessionId)
    if (!session) return
    const pick = (key: string) =>
      typeof fields[key] === 'string' ? (fields[key] as string).slice(0, 80) : null
    session.metadata = {
      ...session.metadata,
      three_ds_return: {
        authentication_status: pick('AuthenticationStatus'),
        eci: pick('ECI'),
        transaction_id: pick('TransactionId'),
        received_at: DateTime.now().toISO(),
      },
    }
    await session.save()
  }

  private static async billToFor(
    session: CardDepositSession,
    billing: BillingAddress
  ): Promise<BillTo> {
    const user = await User.findOrFail(session.userId)
    const { firstName, lastName } = splitName(user.fullName)
    return {
      firstName,
      lastName,
      // Checked when the session was created (createSession).
      email: user.email!,
      phoneNumber: billing.phoneNumber,
      addressLine1: billing.addressLine1,
      addressCity: billing.addressCity,
      // Only the US and Canada require a real one; CyberSource accepts this placeholder elsewhere.
      addressPostalCode: '00000',
      addressCountry: billing.addressCountry.toUpperCase(),
    }
  }

  /* ------------------------------------------------------------------------ */
  /*                                 Charge                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Sends the charge. The ledger row is committed first (status `processing`); the charge
   * outcome is then applied through `settle()`. A lost or undecided answer leaves the top-up in
   * `charging`, for the webhook or the sweep to settle — never credited on a guess, never
   * failed on a guess.
   *
   * Safe to call twice (double tap, page reload): a session already charging or settled is
   * returned as it is, and GoFreshPay itself refuses to debit the same transaction_uuid twice.
   */
  static async charge(
    gateway: CardGateway,
    session: CardDepositSession,
    transientToken: string
  ): Promise<CardDepositSession> {
    if (session.status === 'charging' || session.isTerminal) return session
    this.assertOpen(session, ['authenticating', 'challenge'])
    if (!session.authenticationTransactionId || !session.metadata?.bill_to) {
      throw new CardDepositException('3D Secure has not been completed', 'INVALID_STATE')
    }

    const started = await db.transaction(async (trx) => {
      const locked = await CardDepositSession.query({ client: trx })
        .where('id', session.id)
        .forUpdate()
        .firstOrFail()
      if (locked.status === 'charging' || locked.isTerminal) return null

      const record = new LedgerTransaction()
      record.id = IdGenerator.generateTransactionId()
      record.uuid = uuidv4()
      record.type = 'card_deposit'
      record.status = 'processing'
      record.provider = gateway.name
      record.providerReferenceId = locked.gatewayTransactionUuid!
      record.correlationId = this.correlationId(locked)
      record.idempotencyKey = null
      record.initiatedByType = 'user'
      record.initiatedById = locked.userId
      record.description = 'Card top-up'
      record.amount = locked.amount
      record.currencyCode = locked.currencyCode
      record.paymentMethod = 'card'
      record.paymentChannel = null
      record.counterpartyPhone = null
      record.metadata = {
        wallet_id: locked.walletId,
        card_deposit_session_id: locked.id,
        merchant_reference: locked.merchantReference,
        amount: locked.amount.toString(),
        currency_code: locked.currencyCode,
      }
      await record.useTransaction(trx).save()

      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: record.id,
          event_type: 'card_deposit.initiated',
          payload: { transaction_id: record.id, amount: locked.amount.toString() },
          status: 'pending',
          created_at: new Date(),
        })

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: locked.userId,
        action: 'transaction.card_deposit.initiated',
        resourceType: 'ledger_transaction',
        resourceId: record.id,
        after: {
          amount: locked.amount.toString(),
          currency_code: locked.currencyCode,
          status: record.status,
          card_deposit_session_id: locked.id,
        },
        correlationId: record.correlationId,
        trx,
      })

      locked.status = 'charging'
      locked.ledgerTransactionId = record.id
      await locked.useTransaction(trx).save()
      return locked
    })

    if (!started) return CardDepositSession.findOrFail(session.id)

    let outcome: Awaited<ReturnType<CardGateway['charge']>>
    try {
      outcome = await gateway.charge({
        transientToken,
        transactionUuid: started.gatewayTransactionUuid!,
        authenticationTransactionId: started.authenticationTransactionId!,
        amountMinor: started.amount,
        currencyCode: started.currencyCode,
        merchantReference: started.merchantReference,
        billTo: await this.billToFor(started, started.metadata.bill_to),
        callbackUrl: CardCheckoutUrls.webhook(),
      })
    } catch (error) {
      if (error instanceof GoFreshPayRequestException && error.outcome === 'rejected') {
        // A 4xx: GoFreshPay refused the request itself, so no card was debited.
        return this.settle(started.gatewayTransactionUuid!, {
          status: 'FAILED',
          reasonCode: error.httpStatus ? `HTTP_${error.httpStatus}` : 'REJECTED',
          message: error.message.slice(0, 255),
          source: 'charge',
          ...EMPTY_CARD,
        })
      }
      // Timeout, network, 5xx: the card may have been debited. Left for the webhook or the sweep.
      logger.warn(
        { err: error, session: started.id },
        'card deposit: charge outcome unknown, left to reconciliation'
      )
      return started
    }

    if (outcome.status === 'PENDING') return started

    return this.settle(started.gatewayTransactionUuid!, {
      status: outcome.status,
      gatewayTransactionId: outcome.gatewayTransactionId,
      reasonCode: outcome.reasonCode,
      message: outcome.message,
      source: 'charge',
      ...EMPTY_CARD,
    })
  }

  /* ------------------------------------------------------------------------ */
  /*                               Settlement                                 */
  /* ------------------------------------------------------------------------ */

  /**
   * The only place a card top-up is credited or failed. Idempotent; see the class comment.
   * Returns the session as it stands afterwards.
   */
  static async settle(
    gatewayTransactionUuid: string,
    outcome: SettleOutcome
  ): Promise<CardDepositSession> {
    const result = await db.transaction(async (trx) => {
      const session = await CardDepositSession.query({ client: trx })
        .where('gateway_transaction_uuid', gatewayTransactionUuid)
        .forUpdate()
        .first()
      if (!session) {
        throw new CardDepositException('Card deposit not found', 'SESSION_NOT_FOUND')
      }

      // Card details arrive with the webhook and the status call, not with the charge response:
      // whichever brings them first fills them in, even on an already settled session.
      this.applyCardDetails(session, outcome)

      if (session.isTerminal || !session.ledgerTransactionId) {
        if (!session.ledgerTransactionId && outcome.status === 'SUCCESS') {
          // A success for a charge we never sent. Cannot happen through charge(); never credit it
          // blind — someone has to look.
          logger.error(
            { session: session.id, gatewayTransactionUuid, source: outcome.source },
            'card deposit: success reported for a session that was never charged'
          )
        }
        await session.useTransaction(trx).save()
        return { session, txn: null as LedgerTransaction | null, changed: false }
      }

      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', session.ledgerTransactionId)
        .forUpdate()
        .firstOrFail()
      if (txn.status === 'completed' || txn.status === 'failed') {
        await session.useTransaction(trx).save()
        return { session, txn, changed: false }
      }

      // The gateway's amount must be ours before anything is credited.
      if (
        outcome.status === 'SUCCESS' &&
        outcome.amountMajor !== null &&
        outcome.amountMajor !== undefined
      ) {
        const reported = majorToMinor(outcome.amountMajor)
        const currencyMatches =
          !outcome.currencyCode || outcome.currencyCode === session.currencyCode
        if (reported !== session.amount || !currencyMatches) {
          logger.error(
            {
              session: session.id,
              expected: `${session.amount} ${session.currencyCode}`,
              reported: `${outcome.amountMajor} ${outcome.currencyCode}`,
            },
            'card deposit: amount reported by the gateway does not match, not credited'
          )
          session.metadata = {
            ...session.metadata,
            amount_mismatch: {
              amount: outcome.amountMajor,
              currency: outcome.currencyCode,
              source: outcome.source,
            },
          }
          await session.useTransaction(trx).save()
          return { session, txn, changed: false }
        }
      }

      if (outcome.status === 'FAILED') {
        await this.applyFailure(session, txn, outcome, trx)
      } else {
        await this.applySuccess(session, txn, outcome, trx)
      }
      return { session, txn, changed: true }
    })

    if (result.changed) {
      Realtime.toUser(result.session.userId, {
        type: 'card_deposit.updated',
        session_id: result.session.id,
        status: result.session.status,
      })
    }
    return result.session
  }

  private static applyCardDetails(session: CardDepositSession, details: CardDetails) {
    session.cardScheme = details.cardScheme ?? details.cardType ?? session.cardScheme
    session.cardLast4 = details.cardLast4 ?? session.cardLast4
    session.cardIssuer = details.cardIssuer ?? session.cardIssuer
    session.cardBinCountry = details.cardBinCountry ?? session.cardBinCountry
  }

  private static async applyFailure(
    session: CardDepositSession,
    txn: LedgerTransaction,
    outcome: SettleOutcome,
    trx: TransactionClientContract
  ) {
    const code = outcome.reasonCode ?? 'DECLINED'
    const message = outcome.message ?? 'Card payment declined'

    txn.status = 'failed'
    txn.completedAt = DateTime.now()
    txn.failureReason = `${code}: ${message}`.slice(0, 255)
    txn.metadata = {
      ...(txn.metadata as any),
      failure_reason: { code, message },
      gateway_transaction_id: outcome.gatewayTransactionId ?? undefined,
      settled_by: outcome.source,
    }
    await txn.useTransaction(trx).save()

    session.status = 'failed'
    session.failureCode = code.slice(0, 40)
    session.failureMessage = message.slice(0, 255)
    session.completedAt = DateTime.now()
    await session.useTransaction(trx).save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'transaction.card_deposit.failed',
      resourceType: 'ledger_transaction',
      resourceId: txn.id,
      before: { status: 'processing' },
      after: { status: 'failed', reason_code: code, settled_by: outcome.source },
      correlationId: txn.correlationId,
      trx,
    })

    // Through the outbox: a relay retries it if SMTP is down, which a direct send would lose.
    await TransactionNotifier.enqueueEmail(txn, 'card_deposit.failed', trx)
    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: session.userId,
      type: 'card_deposit.failed',
      title: 'Card top-up failed',
      message: `Your card top-up of ${new Money(session.amount, session.currencyCode).toString()} was declined. Nothing was debited from your account.`,
      data: { transaction_id: txn.id, card_deposit_session_id: session.id },
    })
  }

  private static async applySuccess(
    session: CardDepositSession,
    txn: LedgerTransaction,
    outcome: SettleOutcome,
    trx: TransactionClientContract
  ) {
    const currencyCode = session.currencyCode
    const amount = new Money(session.amount, currencyCode)

    const feePercent = await FeeScheduleService.getFeePercent('card_deposit')
    const feeBps = BigInt(Math.round(feePercent * 100))
    const fee = (amount.amount * feeBps + 5000n) / 10000n
    const netToUser = amount.amount - fee

    const wallet = await Wallet.query({ client: trx })
      .where('id', session.walletId)
      .forUpdate()
      .firstOrFail()
    const destinationAccount = await db
      .query()
      .from('ledger_accounts')
      .where('owner_id', wallet.id)
      .where('owner_type', 'user_wallet')
      .select('id')
      .useTransaction(trx)
      .first()
    if (!destinationAccount) {
      throw new Error(`Ledger account not found for wallet ${wallet.id}`)
    }

    const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
      `CARD_CLEARING.${currencyCode}`,
      `Card Acceptance Clearing (${currencyCode})`,
      currencyCode,
      trx,
      'asset'
    )

    const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
      { accountId: clearingAccount.id, direction: 'debit', amount },
      {
        accountId: destinationAccount.id,
        direction: 'credit',
        amount: new Money(netToUser, currencyCode),
      },
    ]
    if (fee > 0n) {
      const feesAccount = await LedgerService.getOrCreatePlatformAccount(
        `PLATFORM_FEES.${currencyCode}`,
        `TumaPlus Fees (${currencyCode})`,
        currencyCode,
        trx,
        'revenue'
      )
      entries.push({
        accountId: feesAccount.id,
        direction: 'credit',
        amount: new Money(fee, currencyCode),
      })
    }

    const channel = session.cardScheme ?? null
    const posted = await LedgerService.postTransaction('card_deposit', entries, 'system', 0, {
      correlationId: txn.correlationId,
      description: `Card top-up completed for wallet ${wallet.id}`,
      metadata: {
        fee: fee.toString(),
        net_to_user: netToUser.toString(),
        card_deposit_session_id: session.id,
      },
      amount,
      paymentMethod: 'card',
      paymentChannel: channel ?? undefined,
      fee,
      relatedTransactionId: txn.id,
      trx,
    })

    txn.status = 'completed'
    txn.completedAt = DateTime.now()
    txn.fee = fee
    txn.paymentChannel = channel
    // Same split as mobile money: this tracking row links to the double-entry row it produced.
    txn.relatedTransactionId = posted.id
    txn.metadata = {
      ...(txn.metadata as any),
      fee: fee.toString(),
      net_to_user: netToUser.toString(),
      posted_transaction_id: posted.id,
      gateway_transaction_id: outcome.gatewayTransactionId ?? undefined,
      card_last4: session.cardLast4 ?? undefined,
      settled_by: outcome.source,
    }
    await txn.useTransaction(trx).save()

    session.status = 'completed'
    session.completedAt = DateTime.now()
    await session.useTransaction(trx).save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'transaction.card_deposit.completed',
      resourceType: 'ledger_transaction',
      resourceId: txn.id,
      before: { status: 'processing' },
      after: {
        status: 'completed',
        fee: fee.toString(),
        posted_transaction_id: posted.id,
        settled_by: outcome.source,
      },
      correlationId: txn.correlationId,
      trx,
    })

    await TransactionNotifier.enqueueEmail(txn, 'card_deposit.completed', trx)
    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: session.userId,
      type: 'card_deposit.completed',
      title: 'Card top-up completed',
      message: `Your card top-up of ${new Money(netToUser, currencyCode).toString()} was credited to your wallet.`,
      data: { transaction_id: txn.id, wallet_id: wallet.id, card_deposit_session_id: session.id },
    })
  }

  /** A failure before any charge: no ledger row exists, the session alone records it. */
  private static async failSession(
    session: CardDepositSession,
    code: string,
    message: string | null,
    stage: '3ds'
  ) {
    session.status = 'failed'
    session.failureCode = code.slice(0, 40)
    session.failureMessage = (message ?? 'Card authentication failed').slice(0, 255)
    session.completedAt = DateTime.now()
    await session.save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'card_deposit.session.failed',
      resourceType: 'card_deposit_session',
      resourceId: session.id,
      after: { status: 'failed', stage, reason_code: code },
      correlationId: this.correlationId(session),
    })
    Realtime.toUser(session.userId, {
      type: 'card_deposit.updated',
      session_id: session.id,
      status: 'failed',
    })
  }

  /* ------------------------------------------------------------------------ */
  /*                              Housekeeping                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Safety net, run by the worker: settles charges whose answer never arrived (asking
   * GoFreshPay directly), and closes checkouts abandoned before any charge.
   */
  static async sweep(
    gateway: CardGateway
  ): Promise<{ checked: number; settled: number; expired: number }> {
    const expired = await CardDepositSession.query()
      .whereIn('status', ['created', 'authenticating', 'challenge'])
      .where('expires_at', '<', DateTime.now().toSQL()!)
      .update({ status: 'expired', updated_at: new Date() })

    const charging = await CardDepositSession.query()
      .where('status', 'charging')
      .where('updated_at', '<', DateTime.now().minus({ minutes: RECONCILE_GRACE_MINUTES }).toSQL()!)
      .orderBy('updated_at', 'asc')
      .limit(50)

    let settled = 0
    for (const session of charging) {
      try {
        const live = await gateway.paymentStatus(session.gatewayTransactionUuid!)
        const status =
          live.status === 'SUCCESS'
            ? 'SUCCESS'
            : ['FAILED', 'CANCELLED', 'EXPIRED', 'VOIDED'].includes(live.status)
              ? 'FAILED'
              : null
        if (!status) continue
        const after = await this.settle(session.gatewayTransactionUuid!, {
          cardType: live.cardType,
          cardLast4: live.cardLast4,
          cardIssuer: live.cardIssuer,
          cardScheme: live.cardScheme,
          cardBinCountry: live.cardBinCountry,
          status,
          reasonCode: status === 'FAILED' ? live.status : null,
          message: live.message,
          source: 'reconciliation',
        })
        if (after.isTerminal) settled += 1
      } catch (error) {
        logger.warn(
          { err: error, session: session.id },
          'card deposit: reconciliation check failed'
        )
      }
    }

    return {
      checked: charging.length,
      settled,
      expired: Number(Array.isArray(expired) ? expired[0] : expired) || 0,
    }
  }

  /** What the app shows on its tracking screen. */
  static async getForUser(sessionId: string, userId: number): Promise<CardDepositSession> {
    const session = /^[0-9a-f-]{36}$/i.test(sessionId)
      ? await CardDepositSession.find(sessionId)
      : null
    if (!session || session.userId !== userId) {
      throw new CardDepositException('Card deposit not found', 'SESSION_NOT_FOUND')
    }
    return session
  }
}

const EMPTY_CARD: CardDetails = {
  cardType: null,
  cardLast4: null,
  cardIssuer: null,
  cardScheme: null,
  cardBinCountry: null,
}
