import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import Agent from '#models/agent'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import { TellerSessionService } from '#services/counter/teller_session_service'
import { AgentFloatService } from '#services/agents/agent_float_service'
import { AgentLimitService } from '#services/agents/agent_limit_service'
import { v4 as uuidv4 } from 'uuid'
import {
  CASH_OUT_RESERVATION_TTL_MINUTES,
  CashOutHoldService,
} from '#services/transactions/cash_out_hold_service'

export class CashOutOwnershipException extends Error {
  constructor() {
    super('This cash-out transaction does not belong to you')
    this.name = 'CashOutOwnershipException'
  }
}

export class CashOutExpiredException extends Error {
  constructor() {
    super(
      `This withdrawal expired after ${CASH_OUT_RESERVATION_TTL_MINUTES} minutes — ask the customer to request a new one`
    )
    this.name = 'CashOutExpiredException'
  }
}

export class InsufficientBalanceException extends Error {
  constructor() {
    super('Insufficient balance for cash-out')
    this.name = 'InsufficientBalanceException'
  }
}

export class CashOutService {
  /**
   * Initiate cash-out (withdrawal from wallet via agent)
   * Funds stay in the user wallet until the agent confirms payout at confirm(). The customer pays
   * the agent's commission on top of the amount; it is fixed here, so what they agreed to is what
   * confirm() debits, and the reservation holds amount + fee.
   */
  static async initiate(request: {
    agentId: number
    userWalletId: number
    amount: Money
    correlationId: string
    idempotencyKey?: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      // Locked: two reservations racing on the same wallet must see each other's hold.
      const userWallet = await Wallet.query({ client: trx })
        .where('id', request.userWalletId)
        .forUpdate()
        .firstOrFail()

      // Verify wallet is active
      if (userWallet.status !== 'active') {
        throw new Error(`User wallet is not active (status: ${userWallet.status})`)
      }

      const agent = await Agent.findOrFail(request.agentId, { client: trx })
      // Free for the customer: the agent is paid on their daily cash volume instead
      // (AgentCommissionService). Kept as a variable so the reservation still records a fee of 0.
      const fee = 0n
      const total = request.amount.amount + fee

      if (userWallet.balanceCache < total) {
        throw new InsufficientBalanceException()
      }
      // Nothing is debited until the agent pays out, so earlier reservations still sit in
      // balance_cache: without this, the same money could be reserved at several agents.
      await CashOutHoldService.assertAvailable(userWallet, total, trx)

      await LimitService.assertWithinLimits(userWallet, total, trx)
      // The agent's own cash cap counts the notes handed over, not the fee.
      await AgentLimitService.assertWithinLimits(agent.id, request.amount, trx)

      // An institution's counter must have a drawer open; TumaPlus network agents return null and
      // are untouched. Stamped on this tracking row only, never on the double-entry transaction
      // confirm() posts later: both carry the same type and the same gross, so booking both would
      // make the shift expect twice the cash that crossed it.
      const tellerSessionId = await TellerSessionService.requireSessionForAgent(agent, trx)

      // Create transaction with reserved status
      // Funds stay in user wallet but marked as reserved (pending payout)
      const txn = new LedgerTransaction()
      txn.id = IdGenerator.generateTransactionId() // TXN-XXXXXXXX (must set before save)
      txn.uuid = uuidv4()
      txn.type = 'cash_out'
      txn.status = 'reserved' // funds frozen until agent pays out
      txn.correlationId = request.correlationId
      txn.idempotencyKey = request.idempotencyKey || null
      txn.initiatedByType = 'user'
      txn.initiatedById = userWallet.userId || 0
      txn.description = `Cash-out withdrawal via agent ${request.agentId}`
      txn.amount = request.amount.amount
      txn.currencyCode = request.amount.currencyCode
      // `amount` stays the cash handed over (what a teller's drawer is reconciled against);
      // `fee` is what the customer pays on top. CashOutHoldService holds both.
      txn.fee = fee
      txn.paymentMethod = 'cash_agent'
      txn.tellerSessionId = tellerSessionId
      txn.metadata = {
        agent_id: request.agentId,
        user_wallet_id: request.userWalletId,
        amount: request.amount.amount.toString(),
        fee: fee.toString(),
        currency_code: request.amount.currencyCode,
      }

      await txn.useTransaction(trx).save()

      // Create outbox event for agent notification
      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: txn.id,
          event_type: 'cash_out.initiated',
          payload: {
            transaction_id: txn.id,
            agent_id: request.agentId,
            user_wallet_id: request.userWalletId,
            amount: request.amount.amount.toString(),
            fee: fee.toString(),
            // Without it the relay formats the amount with no currency ("5 000" instead of
            // "5 000 BIF") in both the agent's and the customer's notification.
            currency_code: request.amount.currencyCode,
          },
          status: 'pending',
          created_at: new Date(),
        })

      // Audit
      await AuditLoggerService.record({
        actorType: 'user',
        actorId: userWallet.userId || 0,
        action: 'transaction.cash_out.initiated',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          amount: request.amount.amount.toString(),
          fee: fee.toString(),
          status: txn.status,
        },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Confirm cash-out after agent pays out the physical cash.
   * Debits the customer the amount plus the fee fixed at initiate(), and credits both to the
   * agent's float: the amount replaces the notes they handed over, the fee is their commission.
   *
   * @throws CashOutOwnershipException if callerAgentId isn't the agent assigned to this cash-out
   */
  static async confirm(
    transactionId: string,
    correlationId: string,
    callerAgentId: number
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      // Locked so a confirmation cannot interleave with the customer's cancel or the expiry sweep.
      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', transactionId)
        .forUpdate()
        .firstOrFail()

      if (txn.status !== 'reserved') {
        throw new Error('Transaction must be in reserved status to complete')
      }

      // A lapsed reservation no longer holds the customer's funds (they may have been spent
      // since), so paying it out now could leave the agent out of pocket.
      if (CashOutHoldService.isExpired(txn.createdAt)) {
        throw new CashOutExpiredException()
      }

      const metadata = txn.metadata as any

      if (metadata.agent_id !== callerAgentId) {
        throw new CashOutOwnershipException()
      }

      if (!metadata.amount) {
        throw new Error('Transaction amount missing from metadata')
      }
      const currencyCode = metadata.currency_code || 'USD'
      const amount = new Money(BigInt(metadata.amount), currencyCode)

      // Reservations taken before the fee existed carry none: honour what the customer saw.
      const fee = BigInt(metadata.fee ?? 0)
      const total = new Money(amount.amount + fee, currencyCode)

      const agent = await Agent.findOrFail(metadata.agent_id, { client: trx })
      // Credited only, so a float in a currency the agent never held is opened empty here.
      const agentWallet = await AgentFloatService.ensureFloatWallet(agent, currencyCode, trx)

      // Lock both wallets in deterministic (ascending id) order to avoid cross-transaction
      // deadlocks with other operations touching the same two wallets.
      const walletIds = [agentWallet.id, metadata.user_wallet_id].sort((a, b) => a - b)
      await db
        .query()
        .from('wallets')
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()
        .useTransaction(trx)

      const userAccount = await AgentFloatService.ledgerAccountId(
        metadata.user_wallet_id,
        'user_wallet',
        trx
      )
      const agentAccount = await AgentFloatService.ledgerAccountId(
        agentWallet.id,
        'agent_wallet',
        trx
      )

      const posted = await LedgerService.postTransaction(
        'cash_out',
        [
          { accountId: userAccount, direction: 'debit', amount: total },
          { accountId: agentAccount, direction: 'credit', amount: total },
        ],
        'agent',
        metadata.agent_id,
        {
          correlationId,
          description: `Cash-out completed for wallet ${metadata.user_wallet_id}`,
          // No agent_id here: AgentWorkspaceService and AgentLimitService count tracking rows by it.
          metadata: { agent_commission: fee.toString() },
          amount,
          paymentMethod: 'cash_agent',
          paymentChannel: agent.code,
          fee,
          relatedTransactionId: txn.id,
          trx,
        }
      )

      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.paymentChannel = agent.code
      txn.fee = fee
      // See cash_in_service.ts confirm() for why posted_transaction_id is tracked separately.
      txn.relatedTransactionId = posted.id
      txn.metadata = {
        ...metadata,
        agent_commission: fee.toString(),
        posted_transaction_id: posted.id,
      }
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: metadata.agent_id,
        action: 'transaction.cash_out.confirmed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'reserved' },
        after: {
          status: 'completed',
          agent_commission: fee.toString(),
        },
        correlationId,
        trx,
      })

      // The customer is told once the notes are in their hand — in this transaction, so a
      // confirmation that rolls back announces nothing. See outbox_relay_job.ts.
      await TransactionNotifier.enqueueEmail(
        { id: txn.id, correlationId: txn.correlationId ?? correlationId },
        'cash_out.completed',
        trx
      )

      return txn
    })
  }

  /**
   * Confirm user picked up cash from agent.
   *
   * @throws CashOutOwnershipException if callerUserId isn't the user who initiated this cash-out
   */
  static async confirmPickup(
    transactionId: string,
    callerUserId: number
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.findOrFail(transactionId, { client: trx })

      if (txn.initiatedById !== callerUserId) {
        throw new CashOutOwnershipException()
      }

      if (txn.status !== 'completed') {
        throw new Error('Transaction must be in completed status to confirm pickup')
      }

      txn.status = 'settled'
      txn.completedAt = DateTime.now()
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: callerUserId,
        action: 'transaction.cash_out.settled',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'completed' },
        after: { status: 'settled' },
        correlationId: txn.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Cancel cash-out request (only if in reserved status)
   *
   * @throws CashOutOwnershipException if callerUserId isn't the user who initiated this cash-out
   */
  static async cancel(transactionId: string, callerUserId: number): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', transactionId)
        .forUpdate()
        .firstOrFail()

      if (txn.initiatedById !== callerUserId) {
        throw new CashOutOwnershipException()
      }

      if (txn.status !== 'reserved') {
        throw new Error('Transaction must be in reserved status to cancel')
      }

      txn.status = 'cancelled'
      txn.completedAt = DateTime.now()
      txn.failureReason = 'Cancelled by user'
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: callerUserId,
        action: 'transaction.cash_out.cancelled',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'reserved' },
        after: { status: 'cancelled' },
        correlationId: txn.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Cancel a withdrawal at the counter that initiated it, before any notes left the drawer.
   *
   * The customer-side cancel() above checks the initiating user; at an institution's window the
   * customer may have walked away and the teller is the one who has to clear the line. Nothing
   * was debited at initiate() — the funds only stay reserved — so cancelling moves no money.
   *
   * @throws CashOutOwnershipException if callerAgentId isn't the counter this cash-out was taken at
   */
  static async cancelAtCounter(
    transactionId: string,
    callerAgentId: number,
    reason?: string
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', transactionId)
        .forUpdate()
        .firstOrFail()

      if (txn.type !== 'cash_out' || (txn.metadata as any)?.agent_id !== callerAgentId) {
        throw new CashOutOwnershipException()
      }

      if (txn.status !== 'reserved') {
        throw new Error('Transaction must be in reserved status to cancel')
      }

      txn.status = 'cancelled'
      txn.completedAt = DateTime.now()
      txn.failureReason = reason?.trim() || 'Cancelled at the counter'
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: callerAgentId,
        action: 'transaction.cash_out.cancelled',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'reserved' },
        after: { status: 'cancelled', reason: txn.failureReason },
        correlationId: txn.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Lapse every reservation older than CASH_OUT_RESERVATION_TTL_MINUTES.
   *
   * Nothing was debited at initiate(), so expiring moves no money: it only closes the request so
   * it stops showing as pending on both sides. The funds already stopped counting as held at the
   * cutoff (see CashOutHoldService) — this sweep makes the status say so. Each row is re-read
   * under lock and skipped if a confirmation or cancellation got there first.
   *
   * @returns the number of reservations expired
   */
  static async expireStale(): Promise<number> {
    const candidates = await LedgerTransaction.query()
      .where('type', 'cash_out')
      .where('status', 'reserved')
      .where('created_at', '<', CashOutHoldService.cutoff().toJSDate())
      .select('id')

    let expired = 0
    for (const { id } of candidates) {
      const done = await db.transaction(async (trx) => {
        const txn = await LedgerTransaction.query({ client: trx })
          .where('id', id)
          .forUpdate()
          .first()
        if (!txn || txn.status !== 'reserved') return false

        txn.status = 'cancelled'
        txn.completedAt = DateTime.now()
        txn.failureReason = 'Expired: not paid out in time'
        await txn.useTransaction(trx).save()

        await AuditLoggerService.record({
          actorType: 'system',
          actorId: 0,
          action: 'transaction.cash_out.expired',
          resourceType: 'ledger_transaction',
          resourceId: txn.id,
          before: { status: 'reserved' },
          after: { status: 'cancelled', reason: 'expired' },
          correlationId: txn.correlationId,
          trx,
        })
        return true
      })
      if (done) expired++
    }
    return expired
  }
}
