import { randomUUID } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import type { MobileMoneyProvider } from '#services/mobile_money/provider'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'

export class MobileMoneyDepositNotFoundException extends Error {
  constructor() {
    super('Mobile money deposit not found')
    this.name = 'MobileMoneyDepositNotFoundException'
  }
}

export class MobileMoneyDepositOwnershipException extends Error {
  constructor() {
    super('This deposit does not belong to you')
    this.name = 'MobileMoneyDepositOwnershipException'
  }
}

export class MobileMoneyDepositService {
  /**
   * Phase 1: record the attempt locally (status `pending`), then call the provider.
   * Deliberately two separate DB writes around the network call, rather than one transaction
   * spanning it — holding a DB transaction open for the duration of an external HTTP call
   * risks connection pool exhaustion if PawaPay is slow, and blocks the row for no reason.
   */
  static async initiate(
    provider: MobileMoneyProvider,
    request: {
      initiatedByType: 'user' | 'business'
      initiatedById: number
      walletId: number
      amount: Money
      phoneNumber: string
      providerCode: string
      correlationId: string
      idempotencyKey?: string
    }
  ): Promise<LedgerTransaction> {
    const providerReferenceId = randomUUID()

    const txn = await db.transaction(async (trx) => {
      const wallet = await Wallet.findOrFail(request.walletId, { client: trx })
      if (wallet.status !== 'active') {
        throw new Error(`Wallet is not active (status: ${wallet.status})`)
      }

      const record = new LedgerTransaction()
      record.id = IdGenerator.generateTransactionId()
      record.uuid = uuidv4()
      record.type = 'mobile_money_deposit'
      record.status = 'pending'
      record.provider = provider.name
      record.providerReferenceId = providerReferenceId
      record.correlationId = request.correlationId
      record.idempotencyKey = request.idempotencyKey || null
      record.initiatedByType = request.initiatedByType
      record.initiatedById = request.initiatedById
      record.description = `Mobile money deposit via ${request.providerCode}`
      record.amount = request.amount.amount
      record.currencyCode = request.amount.currencyCode
      record.paymentMethod = 'mobile_money'
      record.paymentChannel = request.providerCode
      record.counterpartyPhone = request.phoneNumber
      record.metadata = {
        wallet_id: request.walletId,
        phone_number: request.phoneNumber,
        provider_code: request.providerCode,
        amount: request.amount.amount.toString(),
        currency_code: request.amount.currencyCode,
      }

      await record.useTransaction(trx).save()

      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: record.id,
          event_type: 'mobile_money_deposit.initiated',
          payload: { transaction_id: record.id, amount: request.amount.amount.toString() },
          status: 'pending',
          created_at: new Date(),
        })

      await AuditLoggerService.record({
        actorType: request.initiatedByType,
        actorId: request.initiatedById,
        action: 'transaction.mobile_money_deposit.initiated',
        resourceType: 'ledger_transaction',
        resourceId: record.id,
        before: undefined,
        after: { amount: request.amount.amount.toString(), status: record.status },
        correlationId: request.correlationId,
        trx,
      })

      return record
    })

    const result = await provider.initiateDeposit({
      providerReferenceId,
      amount: request.amount.amount.toString(),
      currencyCode: request.amount.currencyCode,
      phoneNumber: request.phoneNumber,
      providerCode: request.providerCode,
    })

    if (result.outcome === 'REJECTED') {
      txn.status = 'failed'
      txn.completedAt = DateTime.now()
      txn.failureReason = result.failureReason
        ? `${result.failureReason.code}: ${result.failureReason.message}`
        : null
      txn.metadata = { ...txn.metadata, failure_reason: result.failureReason }
      await txn.save()
      await notifyBusinessWebhook(txn, 'mobile_money_deposit.failed')
      // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
      // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
      await TransactionNotifier.enqueueEmail(txn, 'mobile_money_deposit.failed')
      await InAppNotificationService.notify({
        recipientType: request.initiatedByType,
        recipientId: request.initiatedById,
        type: 'mobile_money_deposit.failed',
        title: 'Deposit failed',
        message: `Your deposit of ${request.amount.amount} ${request.amount.currencyCode} was rejected.`,
        data: { transaction_id: txn.id },
      })
      return txn
    }

    txn.status = 'processing'
    await txn.save()
    return txn
  }

  /**
   * Called by the (signature-verified) webhook handler and by the reconciliation sweep.
   * Idempotent: a deposit already in a terminal state is a no-op.
   */
  static async confirmFromCallback(
    providerName: string,
    providerReferenceId: string,
    finalStatus: 'COMPLETED' | 'FAILED',
    options: { providerTransactionId?: string; failureReason?: { code: string; message: string } }
  ): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await LedgerTransaction.query({ client: trx })
        .where('provider', providerName)
        .where('provider_reference_id', providerReferenceId)
        .first()

      if (!txn) {
        throw new MobileMoneyDepositNotFoundException()
      }

      if (txn.status === 'completed' || txn.status === 'failed') {
        return txn // already terminal — replayed callback, no-op
      }

      const metadata = txn.metadata as any

      if (finalStatus === 'FAILED') {
        txn.status = 'failed'
        txn.completedAt = DateTime.now()
        txn.failureReason = options.failureReason
          ? `${options.failureReason.code}: ${options.failureReason.message}`
          : null
        txn.metadata = { ...metadata, failure_reason: options.failureReason }
        await txn.useTransaction(trx).save()

        await AuditLoggerService.record({
          actorType: 'system',
          actorId: 0,
          action: 'transaction.mobile_money_deposit.failed',
          resourceType: 'ledger_transaction',
          resourceId: txn.id,
          before: { status: 'processing' },
          after: { status: 'failed' },
          correlationId: txn.correlationId,
          trx,
        })

        await notifyBusinessWebhook(txn, 'mobile_money_deposit.failed', trx)
        // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
        // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
        await TransactionNotifier.enqueueEmail(txn, 'mobile_money_deposit.failed', trx)
        await InAppNotificationService.notify({
          recipientType: txn.initiatedByType as 'user' | 'business',
          recipientId: txn.initiatedById,
          type: 'mobile_money_deposit.failed',
          title: 'Deposit failed',
          message: `Your deposit of ${metadata.amount} ${metadata.currency_code} failed.`,
          data: { transaction_id: txn.id },
        })

        return txn
      }

      const currencyCode = metadata.currency_code || 'USD'
      const amount = new Money(BigInt(metadata.amount), currencyCode)

      const feePercent = await FeeScheduleService.getFeePercent('mobile_money_deposit')
      const feeBps = BigInt(Math.round(feePercent * 100))
      const fee = (amount.amount * feeBps + 5000n) / 10000n
      const netToUser = amount.amount - fee

      const wallet = await Wallet.query({ client: trx })
        .where('id', metadata.wallet_id)
        .forUpdate()
        .firstOrFail()

      // owner_id alone uniquely identifies the account (wallet ids are globally unique across
      // user/agent/business wallets) — not filtering by a single owner_type keeps this correct
      // for both user- and business-initiated deposits.
      const destinationAccount = await db
        .query()
        .from('ledger_accounts')
        .where('owner_id', wallet.id)
        .whereIn('owner_type', ['user_wallet', 'agent_wallet', 'business_wallet'])
        .select('id')
        .useTransaction(trx)
        .first()

      if (!destinationAccount) {
        throw new Error('Ledger account not found for wallet')
      }

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `MOBILE_MONEY_CLEARING.${currencyCode}`,
        `Mobile Money Clearing (${currencyCode})`,
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

      const posted = await LedgerService.postTransaction(
        'mobile_money_deposit',
        entries,
        'system',
        0,
        {
          correlationId: txn.correlationId,
          description: `Mobile money deposit completed for wallet ${wallet.id}`,
          metadata: { fee: fee.toString(), net_to_user: netToUser.toString() },
          amount,
          paymentMethod: 'mobile_money',
          paymentChannel: txn.paymentChannel ?? undefined,
          counterpartyPhone: txn.counterpartyPhone ?? undefined,
          fee,
          relatedTransactionId: txn.id,
          trx,
        }
      )

      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.fee = fee
      // See MobileMoneyPayoutService.debitWallet() for why posted_transaction_id is tracked
      // separately from this tracking row's own id.
      txn.relatedTransactionId = posted.id
      txn.metadata = {
        ...metadata,
        provider_transaction_id: options.providerTransactionId,
        fee: fee.toString(),
        net_to_user: netToUser.toString(),
        posted_transaction_id: posted.id,
      }
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'transaction.mobile_money_deposit.completed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'processing' },
        after: { status: 'completed', fee: fee.toString() },
        correlationId: txn.correlationId,
        trx,
      })

      await notifyBusinessWebhook(txn, 'mobile_money_deposit.completed', trx)
      // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
      // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
      await TransactionNotifier.enqueueEmail(txn, 'mobile_money_deposit.completed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'mobile_money_deposit.completed',
        title: 'Deposit completed',
        message: `Your deposit of ${netToUser} ${currencyCode} was credited to your wallet.`,
        data: { transaction_id: txn.id, wallet_id: wallet.id },
      })

      return txn
    })
  }

  static async getByIdForInitiator(
    transactionId: string,
    initiatedByType: 'user' | 'business',
    initiatedById: number
  ): Promise<LedgerTransaction> {
    const txn = await LedgerTransaction.findOrFail(transactionId)
    if (
      txn.type !== 'mobile_money_deposit' ||
      txn.initiatedByType !== initiatedByType ||
      txn.initiatedById !== initiatedById
    ) {
      throw new MobileMoneyDepositOwnershipException()
    }
    return txn
  }
}
