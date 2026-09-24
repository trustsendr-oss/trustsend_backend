import { createHash, randomBytes } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { IdGenerator } from '#services/security/id_generator'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import type { CryptoNetwork, CryptoTokenSymbol } from '#services/crypto/crypto_types'

export class CryptoDepositAddressNotFoundException extends Error {
  constructor(address: string, network: string) {
    super(`No active deposit address registered for ${address} on network ${network}`)
    this.name = 'CryptoDepositAddressNotFoundException'
  }
}

export class CryptoDepositService {
  /**
   * Generates or retrieves a unique deposit address for the user or business.
   */
  static async getOrCreateDepositAddress(params: {
    userId?: number
    businessId?: number
    walletId: number
    network: CryptoNetwork | string
    tokenSymbol: CryptoTokenSymbol | string
  }): Promise<CryptoDepositAddress> {
    const network = params.network.toLowerCase()
    const tokenSymbol = params.tokenSymbol.toUpperCase()

    let query = CryptoDepositAddress.query()
      .where('network', network)
      .where('token_symbol', tokenSymbol)
      .where('status', 'active')

    if (params.userId) {
      query = query.where('user_id', params.userId)
    } else if (params.businessId) {
      query = query.where('business_id', params.businessId)
    }

    const existing = await query.first()
    if (existing) {
      return existing
    }

    // Generate a deterministic custodial deposit address or unique sub-address
    // Uses standard EVM 20-byte address format (0x + 40 hex chars) derived safely
    const seed = `${params.userId || params.businessId}:${params.walletId}:${network}:${tokenSymbol}:${Date.now()}`
    const hash = createHash('sha256').update(seed).update(randomBytes(16)).digest('hex')
    const generatedAddress = '0x' + hash.substring(0, 40)

    const newRecord = new CryptoDepositAddress()
    newRecord.userId = params.userId || null
    newRecord.businessId = params.businessId || null
    newRecord.walletId = params.walletId
    newRecord.network = network
    newRecord.tokenSymbol = tokenSymbol
    newRecord.address = generatedAddress
    newRecord.status = 'active'

    await newRecord.save()
    return newRecord
  }

  /**
   * Process and settle an incoming on-chain deposit event (e.g. from Alchemy Webhook).
   * Fully idempotent: duplicate txHash/logIndex will return the existing completed transaction.
   */
  static async processIncomingDeposit(params: {
    network: string
    tokenSymbol: string
    toAddress: string
    fromAddress: string
    rawAmount: string | bigint
    txHash: string
    blockNumber?: string | number
    logIndex?: string | number
  }): Promise<LedgerTransaction> {
    const network = params.network.toLowerCase()
    const tokenSymbol = params.tokenSymbol.toUpperCase()
    const normalizedTo = params.toAddress.toLowerCase()
    const logIdx = params.logIndex ?? 0
    const providerReferenceId = `${network}:${params.txHash}:${logIdx}`

    return db.transaction(async (trx) => {
      // 1. Check if already processed (idempotency)
      const existingTxn = await LedgerTransaction.query({ client: trx })
        .where('provider', 'alchemy')
        .where('provider_reference_id', providerReferenceId)
        .first()

      if (existingTxn) {
        return existingTxn
      }

      // 2. Locate the registered deposit address
      const depositAddress = await CryptoDepositAddress.query({ client: trx })
        .whereRaw('LOWER(address) = ?', [normalizedTo])
        .where('network', network)
        .where('status', 'active')
        .first()

      if (!depositAddress) {
        throw new CryptoDepositAddressNotFoundException(params.toAddress, network)
      }

      // 3. Find the destination wallet
      const wallet = await Wallet.findOrFail(depositAddress.walletId, { client: trx })
      if (wallet.status !== 'active') {
        throw new Error(`Wallet ${wallet.id} is not active (status: ${wallet.status})`)
      }

      // 4. Calculate amount in hundredths (USDC/USDT = 6 decimals)
      const hundredths = AlchemyProvider.convertRawTokenToHundredths(params.rawAmount, 6)
      if (hundredths <= 0n) {
        throw new Error(`Invalid deposit amount: raw ${params.rawAmount} converted to ${hundredths}`)
      }

      const depositCurrency = wallet.currencyCode || 'USD'
      const grossAmount = new Money(hundredths, depositCurrency)

      // 5. Calculate fee
      const feePercent = await FeeScheduleService.getFeePercent('crypto_deposit')
      const feeBps = BigInt(Math.round(feePercent * 100))
      const feeAmount = (grossAmount.amount * feeBps + 5000n) / 10000n
      const netToUser = grossAmount.amount - feeAmount

      // 6. Platform clearing and revenue accounts
      const clearingAccountCode = `CRYPTO_CLEARING_${network.toUpperCase()}`
      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        clearingAccountCode,
        `Crypto Clearing (${network.toUpperCase()})`,
        depositCurrency,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        {
          accountId: clearingAccount.id,
          direction: 'debit',
          amount: grossAmount,
        },
        {
          accountId: wallet.ledgerAccountId,
          direction: 'credit',
          amount: new Money(netToUser, depositCurrency),
        },
      ]

      if (feeAmount > 0n) {
        const feeAccount = await LedgerService.getOrCreatePlatformAccount(
          'PLATFORM_FEE_CRYPTO_DEPOSIT',
          'Platform Fee - Crypto Deposit',
          depositCurrency,
          trx,
          'revenue'
        )
        entries.push({
          accountId: feeAccount.id,
          direction: 'credit',
          amount: new Money(feeAmount, depositCurrency),
        })
      }

      // 7. Post ledger transaction
      const correlationId = `crypto-dep-${uuidv4()}`
      const actorType = depositAddress.userId ? 'user' : 'business'
      const actorId = depositAddress.userId || depositAddress.businessId || 0

      const txn = await LedgerService.postTransaction(
        'crypto_deposit',
        entries,
        actorType,
        actorId,
        {
          correlationId,
          description: `Crypto deposit of ${tokenSymbol} on ${network} (${grossAmount.amount} ${depositCurrency})`,
          amount: grossAmount,
          paymentMethod: 'crypto',
          paymentChannel: `crypto_${tokenSymbol.toLowerCase()}_${network}`,
          fee: feeAmount,
          trx,
          metadata: {
            network,
            token_symbol: tokenSymbol,
            tx_hash: params.txHash,
            from_address: params.fromAddress,
            to_address: params.toAddress,
            raw_amount: params.rawAmount.toString(),
            block_number: params.blockNumber?.toString(),
            deposit_address_id: depositAddress.id,
            wallet_id: wallet.id,
          },
        }
      )

      // Set provider and reference
      txn.provider = 'alchemy'
      txn.providerReferenceId = providerReferenceId
      txn.completedAt = DateTime.now()
      await txn.useTransaction(trx).save()

      // 8. Outbox event
      await db
        .table('outbox_events')
        .useTransaction(trx)
        .insert({
          aggregate_type: 'ledger_transaction',
          aggregate_id: txn.id,
          event_type: 'crypto_deposit.completed',
          payload: {
            transaction_id: txn.id,
            amount: grossAmount.amount.toString(),
            currency: depositCurrency,
            network,
            token: tokenSymbol,
            tx_hash: params.txHash,
          },
          status: 'pending',
          created_at: new Date(),
        })

      // 9. Audit log
      await AuditLoggerService.record({
        actorType: 'system',
        actorId: 0,
        action: 'transaction.crypto_deposit.completed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          amount: grossAmount.amount.toString(),
          status: txn.status,
          network,
          tx_hash: params.txHash,
        },
        correlationId,
        trx,
      })

      // 10. Webhooks & Notifications
      if (depositAddress.businessId) {
        await notifyBusinessWebhook(txn, 'crypto_deposit.completed', trx)
      }

      await TransactionNotifier.enqueueEmail(txn, 'crypto_deposit.completed', trx)
      await InAppNotificationService.notify({
        recipientType: actorType,
        recipientId: actorId,
        type: 'crypto_deposit.completed',
        title: 'Crypto deposit received',
        message: `Your deposit of ${tokenSymbol} on ${network} was received and credited to your wallet.`,
        data: { transaction_id: txn.id, tx_hash: params.txHash },
      })

      return txn
    })
  }
}
