import { randomUUID } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import type { MobileMoneyProvider } from '#services/mobile_money/provider'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'

export class MobileMoneyPayoutNotFoundException extends Error {
  constructor() {
    super('Mobile money payout not found')
    this.name = 'MobileMoneyPayoutNotFoundException'
  }
}

export class MobileMoneyPayoutOwnershipException extends Error {
  constructor() {
    super('This payout does not belong to you')
    this.name = 'MobileMoneyPayoutOwnershipException'
  }
}

export class InsufficientBalanceException extends Error {
  constructor() {
    super('Insufficient balance for mobile money payout')
    this.name = 'InsufficientBalanceException'
  }
}

export class MobileMoneyPayoutService {
  /**
   * Phase 1: record locally (status `initiated`, wallet untouched) and call the provider.
   * Phase 2 (debitWallet, below) only runs once the provider has actually ACCEPTED the
   * payout — we never debit for a payout PawaPay rejected outright.
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
      if (wallet.balanceCache < request.amount.amount) {
        throw new InsufficientBalanceException()
      }

      await LimitService.assertWithinLimits(wallet, request.amount.amount, trx)

      const record = new LedgerTransaction()
      record.id = IdGenerator.generateTransactionId()
      record.uuid = uuidv4()
      record.type = 'mobile_money_payout'
      record.status = 'initiated'
      record.provider = provider.name
      record.providerReferenceId = providerReferenceId
      record.correlationId = request.correlationId
      record.idempotencyKey = request.idempotencyKey || null
      record.initiatedByType = request.initiatedByType
      record.initiatedById = request.initiatedById
      record.description = `Mobile money payout via ${request.providerCode}`
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
          event_type: 'mobile_money_payout.initiated',
          payload: { transaction_id: record.id, amount: request.amount.amount.toString() },
          status: 'pending',
          created_at: new Date(),
        })

      await AuditLoggerService.record({
        actorType: request.initiatedByType,
        actorId: request.initiatedById,
        action: 'transaction.mobile_money_payout.initiated',
        resourceType: 'ledger_transaction',
        resourceId: record.id,
        before: undefined,
        after: { amount: request.amount.amount.toString(), status: record.status },
        correlationId: request.correlationId,
        trx,
      })

      return record
    })

    const result = await provider.initiatePayout({
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

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'transaction.mobile_money_payout.rejected',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'initiated' },
        after: { status: 'failed' },
        correlationId: request.correlationId,
      })

      await notifyBusinessWebhook(txn, 'mobile_money_payout.failed')
      // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
      // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
      await TransactionNotifier.enqueueEmail(txn, 'mobile_money_payout.failed')
      await InAppNotificationService.notify({
        recipientType: request.initiatedByType,
        recipientId: request.initiatedById,
        type: 'mobile_money_payout.failed',
        title: 'Payout failed',
        message: `Your payout of ${request.amount.amount} ${request.amount.currencyCode} was rejected.`,
        data: { transaction_id: txn.id },
      })

      return txn
    }

    // ACCEPTED or DUPLICATE_IGNORED: the provider will move real money — debit the wallet now.
    return db.transaction((trx) => this.debitWallet(trx, txn))
  }

  /**
   * Debits the user's wallet for an ACCEPTED payout and posts the 3-leg ledger entry. Used
   * both right after initiate() and by the reconciliation sweep's self-heal path (if the
   * process crashed between the provider accepting the payout and this debit committing).
   */
  private static async debitWallet(
    trx: TransactionClientContract,
    txn: LedgerTransaction
  ): Promise<LedgerTransaction> {
    const metadata = txn.metadata as any
    const currencyCode = metadata.currency_code || 'USD'
    const amount = new Money(BigInt(metadata.amount), currencyCode)

    const feePercent = await FeeScheduleService.getFeePercent('mobile_money_payout')
    const feeBps = BigInt(Math.round(feePercent * 100))
    const fee = (amount.amount * feeBps + 5000n) / 10000n
    const netToClearing = amount.amount - fee

    // owner_id alone uniquely identifies the account (wallet ids are globally unique across
    // user/agent/business wallets) — not filtering by a single owner_type keeps this correct
    // for both user- and business-initiated payouts.
    const sourceAccount = await db
      .query()
      .from('ledger_accounts')
      .where('owner_id', metadata.wallet_id)
      .whereIn('owner_type', ['user_wallet', 'agent_wallet', 'business_wallet'])
      .select('id')
      .useTransaction(trx)
      .first()

    if (!sourceAccount) {
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
      { accountId: sourceAccount.id, direction: 'debit', amount },
      {
        accountId: clearingAccount.id,
        direction: 'credit',
        amount: new Money(netToClearing, currencyCode),
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
      'mobile_money_payout',
      entries,
      'system',
      0,
      {
        correlationId: txn.correlationId,
        description: `Mobile money payout debited for wallet ${metadata.wallet_id}`,
        metadata: { fee: fee.toString(), net_to_clearing: netToClearing.toString() },
        amount,
        paymentMethod: 'mobile_money',
        paymentChannel: txn.paymentChannel ?? undefined,
        counterpartyPhone: txn.counterpartyPhone ?? undefined,
        fee,
        relatedTransactionId: txn.id,
        trx,
      }
    )

    txn.status = 'processing'
    txn.fee = fee
    // posted_transaction_id: the actual double-entry LedgerTransaction postTransaction() just
    // created — distinct from this tracking row's own id. reverseTransaction() must target
    // THAT one (it requires status='completed', which only the posted entry has).
    txn.relatedTransactionId = posted.id
    txn.metadata = {
      ...metadata,
      fee: fee.toString(),
      net_to_clearing: netToClearing.toString(),
      posted_transaction_id: posted.id,
    }
    await txn.useTransaction(trx).save()

    await AuditLoggerService.record({
      actorType: 'system',
      actorId: 0,
      action: 'transaction.mobile_money_payout.wallet_debited',
      resourceType: 'ledger_transaction',
      resourceId: txn.id,
      before: { status: 'initiated' },
      after: { status: 'processing', fee: fee.toString() },
      correlationId: txn.correlationId,
      trx,
    })

    return txn
  }

  /**
   * Called by the (signature-verified) webhook handler and by the reconciliation sweep.
   * Idempotent: a payout already in a terminal state is a no-op.
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
        throw new MobileMoneyPayoutNotFoundException()
      }

      if (txn.status === 'completed' || txn.status === 'failed') {
        return txn // already terminal — replayed callback, no-op
      }

      // Self-heal: the provider confirmed a final status but our own debit step (normally run
      // right after initiate() accepts) never committed — e.g. the process crashed in between.
      if (txn.status === 'initiated') {
        if (finalStatus === 'FAILED') {
          txn.status = 'failed'
          txn.completedAt = DateTime.now()
          txn.failureReason = options.failureReason
            ? `${options.failureReason.code}: ${options.failureReason.message}`
            : null
          txn.metadata = { ...(txn.metadata as any), failure_reason: options.failureReason }
          await txn.useTransaction(trx).save()
          await notifyBusinessWebhook(txn, 'mobile_money_payout.failed', trx)
          // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
          // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
          await TransactionNotifier.enqueueEmail(txn, 'mobile_money_payout.failed', trx)
          await InAppNotificationService.notify({
            recipientType: txn.initiatedByType as 'user' | 'business',
            recipientId: txn.initiatedById,
            type: 'mobile_money_payout.failed',
            title: 'Payout failed',
            message: `Your payout of ${(txn.metadata as any).amount} ${(txn.metadata as any).currency_code} failed.`,
            data: { transaction_id: txn.id },
          })
          return txn
        }
        await this.debitWallet(trx, txn)
        // fall through: txn is now `processing`, handle COMPLETED below same as normal path
      }

      if (finalStatus === 'FAILED') {
        // Wallet was already debited (status was `processing`) — reverse the actual posted
        // double-entry transaction (a different row than this tracking transaction itself).
        const postedTransactionId = (txn.metadata as any)?.posted_transaction_id
        if (!postedTransactionId) {
          throw new Error(
            `Payout ${txn.id} is processing but has no posted_transaction_id to reverse`
          )
        }
        await LedgerService.reverseTransaction(postedTransactionId, 'system', 0, {
          correlationId: txn.correlationId,
          description: `Reversal: mobile money payout ${txn.id} failed at provider`,
          trx,
        })
        txn.status = 'failed'
        txn.completedAt = DateTime.now()
        txn.failureReason = options.failureReason
          ? `${options.failureReason.code}: ${options.failureReason.message}`
          : null
        txn.metadata = { ...(txn.metadata as any), failure_reason: options.failureReason }
        await txn.useTransaction(trx).save()

        await AuditLoggerService.record({
          actorType: 'system',
          actorId: 0,
          action: 'transaction.mobile_money_payout.failed',
          resourceType: 'ledger_transaction',
          resourceId: txn.id,
          before: { status: 'processing' },
          after: { status: 'failed' },
          correlationId: txn.correlationId,
          trx,
        })

        await notifyBusinessWebhook(txn, 'mobile_money_payout.failed', trx)
        // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
        // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
        await TransactionNotifier.enqueueEmail(txn, 'mobile_money_payout.failed', trx)
        await InAppNotificationService.notify({
          recipientType: txn.initiatedByType as 'user' | 'business',
          recipientId: txn.initiatedById,
          type: 'mobile_money_payout.failed',
          title: 'Payout failed',
          message: `Your payout of ${(txn.metadata as any).amount} ${(txn.metadata as any).currency_code} failed and was reversed.`,
          data: { transaction_id: txn.id },
        })

        return txn
      }

      // COMPLETED: the wallet debit already happened, nothing left to post.
      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.metadata = {
        ...(txn.metadata as any),
        provider_transaction_id: options.providerTransactionId,
      }
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'transaction.mobile_money_payout.completed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: { status: 'processing' },
        after: { status: 'completed' },
        correlationId: txn.correlationId,
        trx,
      })

      await notifyBusinessWebhook(txn, 'mobile_money_payout.completed', trx)
      // L'e-mail passe par l'outbox : la boucle de relais le remet en jeu si le
      // serveur SMTP est indisponible, ce qu'un envoi direct d'ici perdrait.
      await TransactionNotifier.enqueueEmail(txn, 'mobile_money_payout.completed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'mobile_money_payout.completed',
        title: 'Payout completed',
        message: `Your payout of ${(txn.metadata as any).amount} ${(txn.metadata as any).currency_code} was sent successfully.`,
        data: { transaction_id: txn.id },
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
      txn.type !== 'mobile_money_payout' ||
      txn.initiatedByType !== initiatedByType ||
      txn.initiatedById !== initiatedById
    ) {
      throw new MobileMoneyPayoutOwnershipException()
    }
    return txn
  }
}
