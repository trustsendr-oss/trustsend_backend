import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type BusinessStaff from '#models/business_staff'
import TellerSession from '#models/teller_session'
import TellerSessionBalance from '#models/teller_session_balance'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { BusinessStaffIdentityService } from '#services/business/business_staff_identity_service'

export class SessionAlreadyOpenException extends Error {
  constructor(sessionId: number) {
    super(`This counter already has an open session (#${sessionId})`)
    this.name = 'SessionAlreadyOpenException'
  }
}

export class SessionStateException extends Error {
  constructor(status: string, action: string) {
    super(`A session in status "${status}" cannot be ${action}`)
    this.name = 'SessionStateException'
  }
}

export class SelfReconciliationException extends Error {
  constructor() {
    super('A teller cannot sign off their own session')
    this.name = 'SelfReconciliationException'
  }
}

export class UnknownCurrencyException extends Error {
  constructor(currencyCode: string) {
    super(`This counter holds no ${currencyCode} float`)
    this.name = 'UnknownCurrencyException'
  }
}

export class MissingCountException extends Error {
  constructor(currencyCode: string) {
    super(`The ${currencyCode} drawer was not counted`)
    this.name = 'MissingCountException'
  }
}

/**
 * Opening, counting and signing off a teller's shift.
 *
 * ## What reconciliation compares
 *
 * Expected cash is the opening declaration plus the gross of every transaction booked to the
 * shift — never a float-wallet difference. On a cash-out, CashOutService hands the customer the
 * gross in notes but credits the counter's float only the net, the commission going to platform
 * fees; a shift reconciled against the float would therefore report a shortfall equal to the
 * commission on every single one. The gross on the transaction is what actually crossed the
 * counter, so it is what the drawer is measured against.
 *
 * ## Why the numbers are frozen
 *
 * `expectedCash` and `variance` are written once, at close, and never recomputed. A shift is a
 * statement about a moment; a correction made elsewhere afterwards must not quietly rewrite a
 * variance somebody has already signed their name to.
 */
export class TellerSessionService {
  /**
   * Opens a shift for the counter this staff member is posted to.
   *
   * The teller declares what is physically in each drawer. That declaration is the baseline the
   * close is measured against, which is why it is taken from the person rather than read from the
   * float: the float is what the books say, and the entire point of the exercise is to find out
   * when the two disagree.
   */
  static async open(
    staff: BusinessStaff,
    openingCash: Array<{ currencyCode: string; amount: bigint }>,
    correlationId: string
  ): Promise<TellerSession> {
    const counter = await BusinessStaffIdentityService.requireCounterForStaff(staff)

    return db.transaction(async (trx) => {
      const existing = await TellerSession.query({ client: trx })
        .where('agent_id', counter.id)
        .where('status', 'open')
        .first()
      if (existing) {
        throw new SessionAlreadyOpenException(existing.id)
      }

      // Every declared currency must be one the counter actually holds a float in, or the shift
      // would reconcile a drawer no transaction can ever move.
      const floats = await Wallet.query({ client: trx }).where('agent_id', counter.id)
      const held = new Set(floats.map((w) => w.currencyCode))
      for (const line of openingCash) {
        if (!held.has(line.currencyCode)) {
          throw new UnknownCurrencyException(line.currencyCode)
        }
      }

      const session = new TellerSession()
      session.businessId = counter.businessId!
      session.agentId = counter.id
      session.staffId = staff.id
      session.status = 'open'
      session.openedAt = DateTime.now()
      await session.useTransaction(trx).save()

      for (const line of openingCash) {
        const balance = new TellerSessionBalance()
        balance.tellerSessionId = session.id
        balance.currencyCode = line.currencyCode
        balance.openingCash = line.amount
        await balance.useTransaction(trx).save()
      }

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: counter.id,
        action: 'teller_session.opened',
        resourceType: 'teller_session',
        resourceId: session.id,
        before: undefined,
        after: {
          staff_id: staff.id,
          business_id: session.businessId,
          opening: openingCash.map((l) => `${l.currencyCode} ${l.amount}`),
        },
        correlationId,
        trx,
      })

      await session.load('balances')
      return session
    })
  }

  /**
   * Closes a shift against a physical count.
   *
   * Every currency opened has to be counted: leaving one out would silently drop a drawer from
   * the reconciliation, which is the one thing a count is for.
   */
  static async close(
    session: TellerSession,
    countedCash: Array<{ currencyCode: string; amount: bigint }>,
    options: { notes?: string; correlationId: string }
  ): Promise<TellerSession> {
    if (session.status !== 'open') {
      throw new SessionStateException(session.status, 'closed')
    }

    return db.transaction(async (trx) => {
      const balances = await TellerSessionBalance.query({ client: trx }).where(
        'teller_session_id',
        session.id
      )
      const counted = new Map(countedCash.map((l) => [l.currencyCode, l.amount]))

      for (const balance of balances) {
        const count = counted.get(balance.currencyCode)
        if (count === undefined) {
          throw new MissingCountException(balance.currencyCode)
        }

        // The gross that crossed the counter, from the transactions booked to this shift. Reversed
        // transactions are excluded: a reversal cancels the movement, so the notes never moved.
        const movements = await db
          .query()
          .from('ledger_transactions')
          .where('teller_session_id', session.id)
          .where('currency_code', balance.currencyCode)
          .whereIn('status', ['completed', 'settled'])
          .select('type', 'amount')
          .useTransaction(trx)

        let net = 0n
        for (const movement of movements) {
          const amount = BigInt(movement.amount ?? 0)
          // Cash-in puts notes in the drawer, cash-out takes them out. Anything else was not a
          // counter movement and must not shift the expectation.
          if (movement.type === 'cash_in') net += amount
          else if (movement.type === 'cash_out') net -= amount
        }

        balance.expectedCash = balance.openingCash + net
        balance.countedCash = count
        balance.variance = count - balance.expectedCash
        await balance.useTransaction(trx).save()
      }

      session.status = 'closed'
      session.closedAt = DateTime.now()
      session.notes = options.notes ?? null
      await session.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: session.agentId,
        action: 'teller_session.closed',
        resourceType: 'teller_session',
        resourceId: session.id,
        before: { status: 'open' },
        after: {
          status: session.status,
          variances: balances.map((b) => `${b.currencyCode} ${b.variance}`),
        },
        correlationId: options.correlationId,
        trx,
      })

      await session.load('balances')
      return session
    })
  }

  /**
   * Signs off a closed shift.
   *
   * Refused when the signer is the teller who worked it: a person accepting their own variance is
   * a record, not a control. Refused too when the signer belongs to another institution, which
   * would put a stranger's name on an internal decision.
   */
  static async reconcile(
    session: TellerSession,
    signer: BusinessStaff,
    options: { notes?: string; correlationId: string }
  ): Promise<TellerSession> {
    if (session.status !== 'closed') {
      throw new SessionStateException(session.status, 'signed off')
    }
    if (signer.id === session.staffId) {
      throw new SelfReconciliationException()
    }
    if (signer.businessId !== session.businessId) {
      throw new SelfReconciliationException()
    }

    session.status = 'reconciled'
    session.reconciledAt = DateTime.now()
    session.reconciledBy = signer.id
    if (options.notes) {
      session.notes = session.notes ? `${session.notes}\n${options.notes}` : options.notes
    }
    await session.save()

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: signer.id,
      action: 'teller_session.reconciled',
      resourceType: 'teller_session',
      resourceId: session.id,
      before: { status: 'closed' },
      after: { status: session.status, reconciled_by: signer.id },
      correlationId: options.correlationId,
    })

    await session.load('balances')
    return session
  }

  /** The shift currently taking cash at a counter, if any. */
  static async openSessionFor(agentId: number): Promise<TellerSession | null> {
    return TellerSession.query()
      .where('agent_id', agentId)
      .where('status', 'open')
      .preload('balances')
      .first()
  }
}
