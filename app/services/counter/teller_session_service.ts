import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Agent from '#models/agent'
import type BusinessStaff from '#models/business_staff'
import LedgerTransaction from '#models/ledger_transaction'
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

export class NoOpenSessionException extends Error {
  constructor() {
    super('This counter has no open cash session — open one before taking cash')
    this.name = 'NoOpenSessionException'
  }
}

export class UnknownCurrencyException extends Error {
  constructor(currencyCode: string) {
    super(`This counter holds no ${currencyCode} float`)
    this.name = 'UnknownCurrencyException'
  }
}

export class PendingOperationsException extends Error {
  constructor(count: number) {
    super(
      `This session still has ${count} cash operation(s) awaiting confirmation — confirm, reject or cancel them before closing`
    )
    this.name = 'PendingOperationsException'
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
 * shift — never a float-wallet difference. The float moves by more than the notes: a network
 * agent's float also takes their commission (AgentFloatService), and a cash-out credits the
 * customer's fee along with the amount. The gross on the tracking row is what actually crossed
 * the counter, so it is what the drawer is measured against.
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
      // An operation still awaiting its second act would land on a shift that has already been
      // counted: its notes would move after the count and nobody's variance would show them.
      const pending = await this.pendingOperationsQuery(session.id, trx)
      if (pending.length > 0) {
        throw new PendingOperationsException(pending.length)
      }

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

        const totals = await this.movementTotals(session.id, balance.currencyCode, trx)

        balance.expectedCash = balance.openingCash + totals.cashIn - totals.cashOut
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

  /**
   * The shift a cash movement at this agent must be booked to.
   *
   * An institution's counter has to have a drawer open: cash crossing a counter with no session
   * is cash nobody can be asked about later, which is the whole failure this table exists to
   * prevent. TumaPlus's own network agents have no sessions at all and are unaffected — they
   * return null and their transactions stay unbooked, exactly as every transaction is today.
   *
   * Callers stamp this on the TRACKING row only. The double-entry transaction that
   * LedgerService.postTransaction creates alongside it carries the same type and the same gross,
   * so booking both would make every shift expect twice the cash that actually crossed it.
   */
  static async requireSessionForAgent(
    agent: Agent,
    trx?: TransactionClientContract
  ): Promise<number | null> {
    if (!agent.businessId) {
      return null
    }

    const query = trx ? TellerSession.query({ client: trx }) : TellerSession.query()
    const session = await query.where('agent_id', agent.id).where('status', 'open').first()

    if (!session) {
      throw new NoOpenSessionException()
    }
    return session.id
  }

  /**
   * The gross that crossed the counter in one currency, from the tracking rows booked to this
   * shift. Only completed/settled rows count: a pending deposit's notes may never arrive, and a
   * reversed or cancelled one never moved. The same computation serves the close (where it is
   * frozen) and the live figure an open drawer shows, so the two can never disagree.
   */
  static async movementTotals(
    sessionId: number,
    currencyCode: string,
    trx?: TransactionClientContract
  ): Promise<{ cashIn: bigint; cashOut: bigint; count: number }> {
    const query = db
      .query()
      .from('ledger_transactions')
      .where('teller_session_id', sessionId)
      .where('currency_code', currencyCode)
      .whereIn('status', ['completed', 'settled'])
      .whereIn('type', ['cash_in', 'cash_out'])
      .select('type', 'amount')
    if (trx) query.useTransaction(trx)
    const movements = await query

    let cashIn = 0n
    let cashOut = 0n
    for (const movement of movements) {
      const amount = BigInt(movement.amount ?? 0)
      if (movement.type === 'cash_in') cashIn += amount
      else cashOut += amount
    }
    return { cashIn, cashOut, count: movements.length }
  }

  /**
   * What the drawer should hold right now, per currency. Computed, never stored: the stored
   * `expectedCash` is written once at close and must stay a statement about that moment.
   */
  static async liveTotals(session: TellerSession) {
    const balances = session.balances ?? []
    return Promise.all(
      balances.map(async (balance) => {
        const totals = await this.movementTotals(session.id, balance.currencyCode)
        return {
          currency_code: balance.currencyCode,
          cash_in: totals.cashIn.toString(),
          cash_out: totals.cashOut.toString(),
          operations: totals.count,
          expected_cash: (balance.openingCash + totals.cashIn - totals.cashOut).toString(),
        }
      })
    )
  }

  /**
   * Operations initiated on this shift that still await their second act: a deposit whose notes
   * have not been confirmed in the drawer (`pending`), a withdrawal whose notes have not been
   * handed over (`reserved`).
   */
  static pendingOperationsQuery(sessionId: number, trx?: TransactionClientContract) {
    const query = LedgerTransaction.query()
      .where('teller_session_id', sessionId)
      .where((q) => {
        q.where((inner) => inner.where('type', 'cash_in').where('status', 'pending')).orWhere(
          (inner) => inner.where('type', 'cash_out').where('status', 'reserved')
        )
      })
      .orderBy('created_at', 'asc')
    if (trx) query.useTransaction(trx)
    return query
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
