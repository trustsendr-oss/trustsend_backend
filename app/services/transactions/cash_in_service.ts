import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import Agent from '#models/agent'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { v4 as uuidv4 } from 'uuid'

export class CashInOwnershipException extends Error {
  constructor() {
    super('This cash-in transaction does not belong to you')
    this.name = 'CashInOwnershipException'
  }
}

export class InsufficientFloatException extends Error {
  constructor() {
    super('Agent does not have sufficient float')
    this.name = 'InsufficientFloatException'
  }
}

export class CashInService {
  /**
   * Initiate cash-in (deposit to wallet via agent)
   * Agent receives cash physically, credits user's wallet from their own float.
   */
  static async initiate(request: {
    agentId: number
    userWalletId: number
    amount: Money
    correlationId: string
    idempotencyKey?: string
  }): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const agent = await Agent.findOrFail(request.agentId, { client: trx })
      if (!agent.walletId) {
        throw new Error('Agent has no float wallet configured')
      }

      // Fast fail (non-authoritative): the authoritative check + debit happens at confirm(),
      // protected by LedgerService's row lock and negative-balance guard.
      const agentWallet = await Wallet.findOrFail(agent.walletId, { client: trx })
      if (agentWallet.balanceCache < request.amount.amount) {
        throw new InsufficientFloatException()
      }

      const userWallet = await Wallet.findOrFail(request.userWalletId, { client: trx })
      if (!userWallet) {
        throw new Error('User wallet not found')
      }

      // Create transaction with pending status
      // The agent confirms after receiving the physical cash
      const txn = new LedgerTransaction()
      txn.id = IdGenerator.generateTransactionId() // TXN-XXXXXXXX
      txn.uuid = uuidv4()
      txn.type = 'cash_in'
      txn.status = 'pending' // awaiting agent confirmation
      txn.correlationId = request.correlationId
      txn.idempotencyKey = request.idempotencyKey || null
      txn.initiatedByType = 'agent'
      txn.initiatedById = request.agentId
      txn.description = `Cash-in deposit via agent ${agent.code}`
      txn.amount = request.amount.amount
      txn.currencyCode = request.amount.currencyCode
      txn.paymentMethod = 'cash_agent'
      txn.paymentChannel = agent.code
      txn.metadata = {
        agent_id: request.agentId,
        agent_wallet_id: agent.walletId,
        user_wallet_id: request.userWalletId,
        amount: request.amount.amount.toString(),
        currency_code: request.amount.currencyCode,
      }

      await txn.useTransaction(trx).save()

      // Create outbox event for notification
      await db.table('outbox_events').useTransaction(trx).insert({
        aggregate_type: 'ledger_transaction',
        aggregate_id: txn.id,
        event_type: 'cash_in.initiated',
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
        actorType: 'agent',
        actorId: request.agentId,
        action: 'transaction.cash_in.initiated',
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
   * Confirm cash-in after agent verifies they received the cash.
   * Debits the agent's own float wallet, credits the user net of commission, and credits
   * the commission to the platform fees account (agent always pays the commission).
   *
   * @throws CashInOwnershipException if callerAgentId isn't the agent who initiated this cash-in
   */
  static async confirm(
    transactionId: string,
    correlationId: string,
    callerAgentId: number
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.findOrFail(transactionId, { client: trx })

      if (txn.status !== 'pending') {
        throw new Error('Transaction must be in pending status to confirm')
      }

      const metadata = txn.metadata as any

      if (metadata.agent_id !== callerAgentId) {
        throw new CashInOwnershipException()
      }

      if (!metadata.amount) {
        throw new Error('Transaction amount missing from metadata')
      }
      const currencyCode = metadata.currency_code || 'USD'
      const amount = new Money(BigInt(metadata.amount), currencyCode)

      // Lock both wallets in deterministic (ascending id) order to avoid cross-transaction
      // deadlocks with other operations touching the same two wallets.
      const walletIds = [metadata.agent_wallet_id, metadata.user_wallet_id].sort((a, b) => a - b)
      const wallets = await db
        .query()
        .from('wallets')
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()
        .useTransaction(trx)

      const agentWalletRow = wallets.find((w: any) => w.id === metadata.agent_wallet_id)
      const userWalletRow = wallets.find((w: any) => w.id === metadata.user_wallet_id)

      if (!agentWalletRow || !userWalletRow) {
        throw new Error('Wallet not found')
      }
      if (userWalletRow.status !== 'active') {
        throw new Error(`User wallet is not active (status: ${userWalletRow.status})`)
      }

      const agent = await Agent.findOrFail(metadata.agent_id, { client: trx })

      // Commission is a percentage (e.g. 2.50 = 2.5%). Round to nearest smallest-unit.
      const commissionBps = BigInt(Math.round(agent.commissionRate * 100)) // e.g. 250 for 2.5%
      const commission = (amount.amount * commissionBps + 5000n) / 10000n
      const netToUser = amount.amount - commission

      const agentAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', agentWalletRow.id)
        .where('owner_type', 'agent_wallet')
        .select('id')
        .useTransaction(trx)
        .first()

      const userAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', userWalletRow.id)
        .where('owner_type', 'user_wallet')
        .select('id')
        .useTransaction(trx)
        .first()

      if (!agentAccount || !userAccount) {
        throw new Error('Ledger accounts not found for wallets')
      }

      const feesAccount = await LedgerService.getOrCreatePlatformAccount(
        `PLATFORM_FEES.${currencyCode}`,
        `TumaPlus Fees (${currencyCode})`,
        currencyCode,
        trx,
        'revenue'
      )

      const posted = await LedgerService.postTransaction(
        'cash_in',
        [
          { accountId: agentAccount.id, direction: 'debit', amount },
          { accountId: userAccount.id, direction: 'credit', amount: new Money(netToUser, currencyCode) },
          { accountId: feesAccount.id, direction: 'credit', amount: new Money(commission, currencyCode) },
        ],
        'agent',
        metadata.agent_id,
        {
          correlationId,
          description: `Cash-in completed for wallet ${metadata.user_wallet_id}`,
          metadata: { commission: commission.toString(), net_to_user: netToUser.toString() },
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
      txn.fee = commission
      // This tracking row (txn.id) is distinct from the actual double-entry transaction
      // postTransaction() just created (posted.id) — the latter is what has ledger entries and
      // is what a dispute reversal must target. See disputes_controller.ts.
      txn.relatedTransactionId = posted.id
      txn.metadata = { ...metadata, posted_transaction_id: posted.id }
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: metadata.agent_id,
        action: 'transaction.cash_in.confirmed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'pending' },
        after: {
          status: 'completed',
          commission: commission.toString(),
          net_to_user: netToUser.toString(),
        },
        correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Reject cash-in if agent couldn't complete
   *
   * @throws CashInOwnershipException if callerAgentId isn't the agent who initiated this cash-in
   */
  static async reject(transactionId: string, callerAgentId: number): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.findOrFail(transactionId, { client: trx })

      if (txn.status !== 'pending') {
        throw new Error('Transaction must be in pending status to reject')
      }

      const metadata = txn.metadata as any
      if (metadata.agent_id !== callerAgentId) {
        throw new CashInOwnershipException()
      }

      txn.status = 'rejected'
      txn.completedAt = DateTime.now()
      txn.failureReason = 'Rejected by agent'
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: callerAgentId,
        action: 'transaction.cash_in.rejected',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'pending' },
        after: { status: 'rejected' },
        correlationId: txn.correlationId,
        trx,
      })

      return txn
    })
  }
}
