import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import LedgerAccount from '#models/ledger_account'
import OutboxEvent from '#models/outbox_event'
import { type Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import {
  TransactionStateMachine,
  P2P_TRANSITIONS,
  type P2pTransactionState,
} from '#services/transactions/state_machine'

export class P2pTransferNotFoundException extends Error {
  constructor(uuid: string) {
    super(`P2P transfer ${uuid} not found`)
    this.name = 'P2pTransferNotFoundException'
  }
}

export class InsufficientBalanceException extends Error {
  constructor(walletId: number, required: bigint, available: bigint) {
    super(`Wallet ${walletId} insufficient balance: required ${required}, available ${available}`)
    this.name = 'InsufficientBalanceException'
  }
}

export class TransactionLimitExceededException extends Error {
  constructor(walletId: number, limitType: string, limit: bigint, requested: bigint) {
    super(`Wallet ${walletId} ${limitType} limit exceeded: limit ${limit}, requested ${requested}`)
    this.name = 'TransactionLimitExceededException'
  }
}

interface P2pTransferRequest {
  senderWalletId: number
  recipientWalletId: number
  amount: Money
  description?: string
  metadata?: Record<string, any>
  correlationId: string
  initiatedByType: 'user' | 'agent'
  initiatedById: number
  idempotencyKey?: string
}

interface P2pTransferResponse {
  transactionUuid: string
  status: P2pTransactionState
  senderWalletId: number
  recipientWalletId: number
  amount: {
    amount: bigint
    currencyCode: string
  }
  createdAt: any
}

/**
 * P2P Transfer Service
 *
 * Orchestrates peer-to-peer money transfers between two wallets.
 * Responsibilities:
 * - Verify wallet existence and ownership
 * - Check transaction and daily limits
 * - Verify sufficient balance (pessimistic locking)
 * - Create double-entry ledger entries (debits sender, credits recipient)
 * - Create outbox event for any post-transaction webhook/notification
 * - Audit the transaction
 * - Handle idempotence via idempotency_key
 */
export class P2pTransferService {
  private static stateMachine = new TransactionStateMachine(P2P_TRANSITIONS)

  /**
   * Initiate a P2P transfer
   *
   * @throws InsufficientBalanceException if sender doesn't have enough balance
   * @throws TransactionLimitExceededException if limits are exceeded
   * @throws P2pTransferNotFoundException if wallets don't exist
   */
  static async initiate(request: P2pTransferRequest): Promise<P2pTransferResponse> {
    return db.transaction(async (trx) => {
      // 1. Load wallets with pessimistic locking (deterministic order: ascending wallet_id)
      const walletIds = [request.senderWalletId, request.recipientWalletId].sort((a, b) => a - b)

      const wallets = await db
        .query()
        .from('wallets')
        .whereIn('id', walletIds)
        .orderBy('id', 'asc')
        .forUpdate()
        .useTransaction(trx)

      if (wallets.length !== 2) {
        throw new P2pTransferNotFoundException(
          `sender=${request.senderWalletId}, recipient=${request.recipientWalletId}`
        )
      }

      const senderWallet = wallets.find((w) => w.id === request.senderWalletId)
      const recipientWallet = wallets.find((w) => w.id === request.recipientWalletId)

      if (!senderWallet || !recipientWallet) {
        throw new P2pTransferNotFoundException(
          `sender=${request.senderWalletId}, recipient=${request.recipientWalletId}`
        )
      }

      // 2. Verify sender has sufficient balance
      // Note: senderWallet is a raw db.query() row (snake_case columns), not a Lucid model.
      if (senderWallet.balance_cache < request.amount.amount) {
        throw new InsufficientBalanceException(
          request.senderWalletId,
          request.amount.amount,
          senderWallet.balance_cache
        )
      }

      // 3. Verify transaction limit (per_transaction_limit)
      if (
        senderWallet.per_transaction_limit &&
        request.amount.amount > senderWallet.per_transaction_limit
      ) {
        throw new TransactionLimitExceededException(
          request.senderWalletId,
          'per_transaction',
          senderWallet.per_transaction_limit,
          request.amount.amount
        )
      }

      // 3b. Verify daily/monthly limits (per-transaction limit already checked above)
      await LimitService.assertWithinLimits(
        {
          id: senderWallet.id,
          ledgerAccountId: senderWallet.ledger_account_id,
          dailyLimit: senderWallet.daily_limit,
          monthlyLimit: senderWallet.monthly_limit,
        },
        request.amount.amount,
        trx
      )

      // 4. Load the ledger accounts for both wallets
      const senderAccount = await LedgerAccount.query()
        .useTransaction(trx)
        .where('ownerId', request.senderWalletId)
        .where((q) => {
          q.where('ownerType', 'user_wallet').orWhere('ownerType', 'agent_wallet')
        })
        .first()

      const recipientAccount = await LedgerAccount.query()
        .useTransaction(trx)
        .where('ownerId', request.recipientWalletId)
        .where((q) => {
          q.where('ownerType', 'user_wallet').orWhere('ownerType', 'agent_wallet')
        })
        .first()

      if (!senderAccount || !recipientAccount) {
        throw new Error('Ledger accounts not found for wallets')
      }

      // 5. Create the double-entry transaction via LedgerService
      const txn = await LedgerService.postTransaction(
        'p2p_transfer',
        [
          {
            accountId: senderAccount.id,
            direction: 'debit',
            amount: request.amount,
          },
          {
            accountId: recipientAccount.id,
            direction: 'credit',
            amount: request.amount,
          },
        ],
        request.initiatedByType,
        request.initiatedById,
        {
          idempotencyKey: request.idempotencyKey,
          correlationId: request.correlationId,
          description: request.description || `P2P transfer from wallet ${request.senderWalletId}`,
          metadata: {
            ...request.metadata,
            sender_wallet_id: request.senderWalletId,
            recipient_wallet_id: request.recipientWalletId,
          },
          amount: request.amount,
          paymentMethod: 'wallet',
          trx,
        }
      )

      // 6. Create an outbox event for post-transaction notifications/webhooks
      // (processed asynchronously by outbox_relay_job)
      const outboxEvent = new OutboxEvent()
      outboxEvent.aggregateType = 'ledger_transaction'
      outboxEvent.aggregateId = txn.id
      outboxEvent.eventType = 'p2p_transfer.completed'
      outboxEvent.payload = {
        transaction_uuid: txn.uuid,
        sender_wallet_id: request.senderWalletId,
        recipient_wallet_id: request.recipientWalletId,
        amount: {
          amount: request.amount.amount.toString(), // serialize bigint to string
          currencyCode: request.amount.currencyCode,
        },
        correlation_id: request.correlationId,
      }
      outboxEvent.status = 'pending'

      await outboxEvent.useTransaction(trx).save()

      // 7. Audit the transaction
      await AuditLoggerService.record({
        actorType: request.initiatedByType,
        actorId: request.initiatedById,
        action: 'transaction.p2p_transfer.initiated',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          transaction_uuid: txn.uuid,
          sender_wallet_id: request.senderWalletId,
          recipient_wallet_id: request.recipientWalletId,
          amount: request.amount.amount.toString(),
          status: txn.status,
        },
        correlationId: request.correlationId,
        trx,
      })

      return {
        transactionUuid: txn.uuid,
        status: txn.status as P2pTransactionState,
        senderWalletId: request.senderWalletId,
        recipientWalletId: request.recipientWalletId,
        amount: {
          amount: request.amount.amount,
          currencyCode: request.amount.currencyCode,
        },
        createdAt: txn.createdAt,
      }
    })
  }

  /**
   * Get P2P transfer by UUID
   */
  static async getByUuid(uuid: string): Promise<LedgerTransaction | null> {
    return LedgerTransaction.query().where('uuid', uuid).where('type', 'p2p_transfer').first()
  }

  /**
   * List transfers for a wallet (as sender or recipient)
   */
  static async listForWallet(
    walletId: number,
    limit: number = 20,
    page: number = 1
  ): Promise<{ data: LedgerTransaction[]; total: number }> {
    const total = await db
      .query()
      .from('ledger_transactions as lt')
      .join('ledger_entries as le1', 'le1.ledger_transaction_id', 'lt.id')
      .join('ledger_accounts as la1', 'la1.id', 'le1.ledger_account_id')
      .where('lt.type', 'p2p_transfer')
      .where((q) => {
        q.where('la1.owner_id', walletId)
          .where('le1.direction', 'debit')
          .orWhere('la1.owner_id', walletId)
          .where('le1.direction', 'credit')
      })
      .countDistinct('lt.id as count')
      .first()

    const offset = (page - 1) * limit

    const data = await db
      .query()
      .from('ledger_transactions as lt')
      .join('ledger_entries as le1', 'le1.ledger_transaction_id', 'lt.id')
      .join('ledger_accounts as la1', 'la1.id', 'le1.ledger_account_id')
      .where('lt.type', 'p2p_transfer')
      .where((q) => {
        q.where('la1.owner_id', walletId)
          .where('le1.direction', 'debit')
          .orWhere('la1.owner_id', walletId)
          .where('le1.direction', 'credit')
      })
      .select('lt.*')
      .distinct()
      .orderBy('lt.created_at', 'desc')
      .limit(limit)
      .offset(offset)

    return {
      data: data as LedgerTransaction[],
      total: Number((total as any)?.count || 0),
    }
  }

  /**
   * Verify state transition is valid (for testing/admin flows)
   */
  static assertTransition(from: P2pTransactionState, to: P2pTransactionState): void {
    this.stateMachine.assertTransition(from, to)
  }
}
