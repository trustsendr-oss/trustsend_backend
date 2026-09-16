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
import { v4 as uuidv4 } from 'uuid'

export class CashOutOwnershipException extends Error {
  constructor() {
    super('This cash-out transaction does not belong to you')
    this.name = 'CashOutOwnershipException'
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
   * Funds stay in the user wallet until the agent confirms payout at confirm().
   */
  static async initiate(request: {
    agentId: number
    userWalletId: number
    amount: Money
    correlationId: string
    idempotencyKey?: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const userWallet = await Wallet.findOrFail(request.userWalletId, { client: trx })

      if (userWallet.balanceCache < request.amount.amount) {
        throw new InsufficientBalanceException()
      }

      // Verify wallet is active
      if (userWallet.status !== 'active') {
        throw new Error(`User wallet is not active (status: ${userWallet.status})`)
      }

      await LimitService.assertWithinLimits(userWallet, request.amount.amount, trx)

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
      txn.paymentMethod = 'cash_agent'
      txn.metadata = {
        agent_id: request.agentId,
        user_wallet_id: request.userWalletId,
        amount: request.amount.amount.toString(),
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
   * Debits the user wallet in full, credits the agent's own float net of commission, and
   * credits the commission to the platform fees account (agent always pays the commission).
   *
   * @throws CashOutOwnershipException if callerAgentId isn't the agent assigned to this cash-out
   */
  static async confirm(
    transactionId: string,
    correlationId: string,
    callerAgentId: number
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.findOrFail(transactionId, { client: trx })

      if (txn.status !== 'reserved') {
        throw new Error('Transaction must be in reserved status to complete')
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

      const agent = await Agent.findOrFail(metadata.agent_id, { client: trx })
      if (!agent.walletId) {
        throw new Error('Agent has no float wallet configured')
      }

      // Lock both wallets in deterministic (ascending id) order to avoid cross-transaction
      // deadlocks with other operations touching the same two wallets.
      const walletIds = [agent.walletId, metadata.user_wallet_id].sort((a, b) => a - b)
      const wallets = await db
        .query()
        .from('wallets')
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()
        .useTransaction(trx)

      const agentWalletRow = wallets.find((w: any) => w.id === agent.walletId)
      const userWalletRow = wallets.find((w: any) => w.id === metadata.user_wallet_id)

      if (!agentWalletRow || !userWalletRow) {
        throw new Error('Wallet not found')
      }

      // Commission is a percentage (e.g. 2.50 = 2.5%). Round to nearest smallest-unit.
      const commissionBps = BigInt(Math.round(agent.commissionRate * 100)) // e.g. 250 for 2.5%
      const commission = (amount.amount * commissionBps + 5000n) / 10000n
      const netToAgent = amount.amount - commission

      const userAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', userWalletRow.id)
        .where('owner_type', 'user_wallet')
        .select('id')
        .useTransaction(trx)
        .first()

      const agentAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', agentWalletRow.id)
        .where('owner_type', 'agent_wallet')
        .select('id')
        .useTransaction(trx)
        .first()

      if (!userAccount || !agentAccount) {
        throw new Error('Ledger accounts not found for wallets')
      }

      const feesAccount = await LedgerService.getOrCreatePlatformAccount(
        `PLATFORM_FEES.${currencyCode}`,
        `TumaPlus Fees (${currencyCode})`,
        currencyCode,
        trx,
        'revenue'
      )

      // Debit user wallet in full, credit agent float net of commission, credit platform fees
      const posted = await LedgerService.postTransaction(
        'cash_out',
        [
          { accountId: userAccount.id, direction: 'debit', amount },
          {
            accountId: agentAccount.id,
            direction: 'credit',
            amount: new Money(netToAgent, currencyCode),
          },
          {
            accountId: feesAccount.id,
            direction: 'credit',
            amount: new Money(commission, currencyCode),
          },
        ],
        'agent',
        metadata.agent_id,
        {
          correlationId,
          description: `Cash-out completed for wallet ${metadata.user_wallet_id}`,
          metadata: { commission: commission.toString(), net_to_agent: netToAgent.toString() },
          amount,
          paymentMethod: 'cash_agent',
          paymentChannel: agent.code,
          fee: commission,
          relatedTransactionId: txn.id,
          trx,
        }
      )

      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.paymentChannel = agent.code
      txn.fee = commission
      // See cash_in_service.ts confirm() for why posted_transaction_id is tracked separately.
      txn.relatedTransactionId = posted.id
      txn.metadata = { ...metadata, posted_transaction_id: posted.id }
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
          commission: commission.toString(),
          net_to_agent: netToAgent.toString(),
        },
        correlationId,
        trx,
      })

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
      const txn = await LedgerTransaction.findOrFail(transactionId, { client: trx })

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
}
