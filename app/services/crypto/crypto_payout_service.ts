import { randomUUID } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import type { CryptoPayoutRequest } from '#services/crypto/crypto_types'

export class InsufficientCryptoBalanceException extends Error {
  constructor() {
    super('Insufficient balance for crypto withdrawal')
    this.name = 'InsufficientCryptoBalanceException'
  }
}

export class CryptoPayoutNotFoundException extends Error {
  constructor() {
    super('Crypto payout transaction not found')
    this.name = 'CryptoPayoutNotFoundException'
  }
}

export class CryptoPayoutService {
  /**
   * Phase 1: validate balance/limits, record transaction in ledger (debit user, credit crypto clearing),
   * and mark as processing for on-chain broadcast.
   */
  static async initiate(request: CryptoPayoutRequest): Promise<LedgerTransaction> {
    const providerReferenceId = randomUUID()
    const network = request.network.toLowerCase()
    const tokenSymbol = request.tokenSymbol.toUpperCase()

    return db.transaction(async (trx) => {
      const wallet = await Wallet.query({ client: trx })
        .where('id', request.walletId)
        .forUpdate()
        .firstOrFail()

      if (wallet.status !== 'active') {
        throw new Error(`Wallet ${wallet.id} is not active (status: ${wallet.status})`)
      }

      const currencyCode = wallet.currencyCode || 'USD'
      const requestedAmount = new Money(request.amount, currencyCode)

      const feePercent = await FeeScheduleService.getFeePercent('crypto_payout')
      const feeBps = BigInt(Math.round(feePercent * 100))
      const feeAmount = (requestedAmount.amount * feeBps + 5000n) / 10000n
      const totalDebit = requestedAmount.amount + feeAmount

      if (wallet.balanceCache < totalDebit) {
        throw new InsufficientCryptoBalanceException()
      }
      await CashOutHoldService.assertAvailable(wallet, totalDebit, trx)

      await LimitService.assertWithinLimits(wallet, totalDebit, trx)

      // Post initial double-entry transaction to escrow/clear funds
      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CRYPTO_CLEARING_${network.toUpperCase()}`,
        `Crypto Clearing (${network.toUpperCase()})`,
        currencyCode,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        {
          accountId: wallet.ledgerAccountId,
          direction: 'debit',
          amount: new Money(totalDebit, currencyCode),
        },
        {
          accountId: clearingAccount.id,
          direction: 'credit',
          amount: requestedAmount,
        },
      ]

      if (feeAmount > 0n) {
        const feeAccount = await LedgerService.getOrCreatePlatformAccount(
          'PLATFORM_FEE_CRYPTO_PAYOUT',
          'Platform Fee - Crypto Payout',
          currencyCode,
          trx,
          'revenue'
        )
        entries.push({
          accountId: feeAccount.id,
          direction: 'credit',
          amount: new Money(feeAmount, currencyCode),
        })
      }

      const txn = await LedgerService.postTransaction(
        'crypto_payout',
        entries,
        request.initiatedByType,
        request.initiatedById,
        {
          idempotencyKey: request.idempotencyKey,
          correlationId: request.correlationId,
          description: `Crypto withdrawal of ${requestedAmount.amount} ${currencyCode} (${tokenSymbol} to ${request.destinationAddress})`,
          amount: requestedAmount,
          paymentMethod: 'crypto',
          paymentChannel: `crypto_${tokenSymbol.toLowerCase()}_${network}`,
          fee: feeAmount,
          trx,
          metadata: {
            wallet_id: wallet.id,
            network,
            token_symbol: tokenSymbol,
            destination_address: request.destinationAddress,
            memo_tag: request.memoTag || null,
            gross_amount: requestedAmount.amount.toString(),
            fee_amount: feeAmount.toString(),
            total_debit: totalDebit.toString(),
            currency_code: currencyCode,
          },
        }
      )

      txn.status = 'processing'
      txn.provider = 'alchemy'
      txn.providerReferenceId = providerReferenceId
      await txn.useTransaction(trx).save()

      // Outbox event
      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: txn.id,
          event_type: 'crypto_payout.initiated',
          payload: {
            transaction_id: txn.id,
            amount: requestedAmount.amount.toString(),
            currency: currencyCode,
            network,
            token: tokenSymbol,
            destination: request.destinationAddress,
          },
          status: 'pending',
          created_at: new Date(),
        })

      // Audit log
      await AuditLoggerService.record({
        actorType: request.initiatedByType,
        actorId: request.initiatedById,
        action: 'transaction.crypto_payout.initiated',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          amount: requestedAmount.amount.toString(),
          destination: request.destinationAddress,
          status: txn.status,
        },
        correlationId: request.correlationId,
        trx,
      })

      return txn
    })
  }

  /**
   * Complete a payout once on-chain transaction hash is mined and verified.
   */
  static async completePayout(
    transactionId: string,
    txHash: string
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', transactionId)
        .first()

      if (!txn) {
        throw new CryptoPayoutNotFoundException()
      }

      if (txn.status === 'completed') {
        return txn
      }

      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.metadata = {
        ...txn.metadata,
        tx_hash: txHash,
        completed_at: DateTime.now().toISO(),
      }
      await txn.useTransaction(trx).save()

      // Outbox event
      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: txn.id,
          event_type: 'crypto_payout.completed',
          payload: { transaction_id: txn.id, tx_hash: txHash },
          status: 'pending',
          created_at: new Date(),
        })

      if (txn.initiatedByType === 'business') {
        await notifyBusinessWebhook(txn, 'crypto_payout.completed', trx)
      }

      await TransactionNotifier.enqueueEmail(txn, 'crypto_payout.completed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'crypto_payout.completed',
        title: 'Crypto withdrawal completed',
        message: `Your withdrawal of ${txn.amount} ${txn.currencyCode} was sent to ${txn.metadata?.destination_address}.`,
        data: { transaction_id: txn.id, tx_hash: txHash },
      })

      return txn
    })
  }

  /**
   * Refund a payout if rejected / failed during blockchain broadcast.
   */
  static async failPayout(
    transactionId: string,
    reason: string
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.query({ client: trx })
        .where('id', transactionId)
        .first()

      if (!txn) {
        throw new CryptoPayoutNotFoundException()
      }

      if (txn.status === 'failed' || txn.status === 'reversed') {
        return txn
      }

      const metadata = txn.metadata as any
      const walletId = metadata.wallet_id
      const wallet = await Wallet.query({ client: trx }).where('id', walletId).forUpdate().firstOrFail()
      const currencyCode = txn.currencyCode || 'USD'
      const totalRefund = BigInt(metadata.total_debit || metadata.gross_amount)
      const network = metadata.network || 'polygon'

      // Reverse double-entry: debit clearing, credit user wallet
      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CRYPTO_CLEARING_${network.toUpperCase()}`,
        `Crypto Clearing (${network.toUpperCase()})`,
        currencyCode,
        trx,
        'asset'
      )

      const refundEntries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        {
          accountId: clearingAccount.id,
          direction: 'debit',
          amount: new Money(totalRefund, currencyCode),
        },
        {
          accountId: wallet.ledgerAccountId,
          direction: 'credit',
          amount: new Money(totalRefund, currencyCode),
        },
      ]

      await LedgerService.postTransaction(
        'crypto_payout_refund',
        refundEntries,
        'system',
        0,
        {
          correlationId: `refund-${txn.correlationId}`,
          description: `Refund for failed crypto withdrawal ${txn.id}: ${reason}`,
          amount: new Money(totalRefund, currencyCode),
          reversalOfTransactionId: txn.id,
          trx,
        }
      )

      txn.status = 'failed'
      txn.failureReason = reason
      txn.completedAt = DateTime.now()
      txn.metadata = { ...metadata, failure_reason: reason }
      await txn.useTransaction(trx).save()

      // Notifications
      if (txn.initiatedByType === 'business') {
        await notifyBusinessWebhook(txn, 'crypto_payout.failed', trx)
      }

      await TransactionNotifier.enqueueEmail(txn, 'crypto_payout.failed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'crypto_payout.failed',
        title: 'Crypto withdrawal failed',
        message: `Your crypto withdrawal failed: ${reason}. Funds have been refunded to your wallet.`,
        data: { transaction_id: txn.id },
      })

      return txn
    })
  }
}
