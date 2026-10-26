import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { getAddress, ZeroAddress } from 'ethers'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import KycVerification from '#models/kyc_verification'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import { Realtime } from '#services/realtime/realtime'
import type { ChainReader } from '#services/crypto/crypto_deposit_service'
import {
  availablePayoutRails,
  networkSpec,
  TOKEN_CURRENCY,
  type EvmNetwork,
  type StablecoinSymbol,
} from '#services/crypto/crypto_networks'
import type { CryptoPayoutRequest } from '#services/crypto/crypto_types'

/** keccak256("Transfer(address,address,uint256)"). */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** A hash the chain still does not know after this long was mistyped or dropped. */
const NOT_FOUND_FLAG_HOURS = 6

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

/** A refused withdrawal request, with a code the app turns into a sentence. */
export class CryptoPayoutException extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 422
  ) {
    super(message)
    this.name = 'CryptoPayoutException'
  }
}

type PayoutMetadata = {
  wallet_id: number
  network: EvmNetwork
  token_symbol: StablecoinSymbol
  destination_address: string
  memo_tag?: string | null
  gross_amount: string
  fee_amount: string
  network_fee?: string
  total_debit: string
  currency_code: string
  tx_hash?: string
  sent_by?: number
  sent_at?: string
  confirmations?: number
  verification_issue?: string | null
  failure_reason?: string
  [key: string]: unknown
}

function metadataOf(txn: LedgerTransaction): PayoutMetadata {
  return (txn.metadata ?? {}) as PayoutMetadata
}

/** Tells the person who asked for the withdrawal that it moved, once `trx` commits. */
function announce(trx: TransactionClientContract, txn: LedgerTransaction) {
  if (txn.initiatedByType !== 'user') return
  Realtime.toUserAfterCommit(trx, txn.initiatedById, {
    type: 'crypto_payout.updated',
    id: txn.id,
    status: txn.status,
  })
}

/**
 * Stablecoin withdrawals — phase 1: every withdrawal is reviewed and sent by staff.
 *
 * 1. `initiate`: the request is checked (network, token, peg currency, minimum, destination,
 *    identity), the wallet is debited into a clearing account, and the withdrawal waits in the
 *    review queue (`pending`).
 * 2. Staff send the tokens from the treasury, then `markSent` records the transaction hash
 *    (`processing`). Or `reject` refunds the user in full (`failed`).
 * 3. `confirmSent` (the crypto confirmation job) re-reads that hash from the chain: a successful
 *    Transfer of the right token, to the right address, for the right amount, with enough blocks
 *    on top. Only then is the withdrawal `completed`. A hash the chain contradicts is flagged for
 *    staff, never refunded automatically — the tokens may already have left.
 *
 * No private key is involved anywhere here: the server never sends funds itself in this phase.
 */
export class CryptoPayoutService {
  static async initiate(request: CryptoPayoutRequest): Promise<LedgerTransaction> {
    const network = request.network.toLowerCase() as EvmNetwork
    const tokenSymbol = request.tokenSymbol.toUpperCase() as StablecoinSymbol

    const rail = availablePayoutRails().find(
      (item) => item.network === network && item.tokenSymbol === tokenSymbol
    )
    if (!rail) {
      throw new CryptoPayoutException(
        `${tokenSymbol} withdrawals on ${network} are not available`,
        'CRYPTO_PAYOUT_RAIL_UNAVAILABLE'
      )
    }
    if (request.amount < rail.minAmount) {
      throw new CryptoPayoutException(
        `The smallest withdrawal is ${rail.minAmount} cents`,
        'CRYPTO_PAYOUT_TOO_SMALL'
      )
    }

    let destination: string
    try {
      // Rejects typos: a mixed-case address carries a checksum that getAddress verifies.
      destination = getAddress(request.destinationAddress.trim())
    } catch {
      throw new CryptoPayoutException(
        'This address is not a valid address',
        'CRYPTO_PAYOUT_INVALID_ADDRESS'
      )
    }
    if (destination === ZeroAddress) {
      throw new CryptoPayoutException(
        'This address cannot receive funds',
        'CRYPTO_PAYOUT_INVALID_ADDRESS'
      )
    }
    // One of our own deposit addresses: the money would come straight back as a deposit, after
    // paying the network twice. A transfer between Reemite users is instant and free.
    const internal = await CryptoDepositAddress.query()
      .whereRaw('LOWER(address) = ?', [destination.toLowerCase()])
      .first()
    if (internal) {
      throw new CryptoPayoutException(
        'This address belongs to a Reemite account: send a Reemite transfer instead',
        'CRYPTO_PAYOUT_INTERNAL_ADDRESS'
      )
    }

    if (request.initiatedByType === 'user') {
      const kyc = await KycVerification.query()
        .where('subject_type', 'user')
        .where('subject_id', request.initiatedById)
        .orderBy('created_at', 'desc')
        .first()
      if (kyc?.status !== 'approved') {
        throw new CryptoPayoutException(
          'Your identity must be verified before withdrawing crypto',
          'KYC_REQUIRED',
          403
        )
      }
    }

    return db.transaction(async (trx) => {
      const wallet = await Wallet.query({ client: trx })
        .where('id', request.walletId)
        .forUpdate()
        .firstOrFail()

      if (wallet.status !== 'active') {
        throw new CryptoPayoutException('This account is not active', 'WALLET_NOT_ACTIVE', 409)
      }
      // A stablecoin only ever leaves a wallet in the currency it is pegged to — no silent FX.
      const currencyCode = TOKEN_CURRENCY[tokenSymbol]
      if (wallet.currencyCode !== currencyCode) {
        throw new CryptoPayoutException(
          `${tokenSymbol} can only be withdrawn from a ${currencyCode} account`,
          'CRYPTO_CURRENCY_MISMATCH'
        )
      }

      const requestedAmount = new Money(request.amount, currencyCode)
      const feePercent = await FeeScheduleService.getFeePercent('crypto_payout')
      const feeBps = BigInt(Math.round(feePercent * 100))
      const serviceFee = (requestedAmount.amount * feeBps + 5000n) / 10000n
      const feeAmount = serviceFee + rail.networkFee
      const totalDebit = requestedAmount.amount + feeAmount

      if (wallet.balanceCache < totalDebit) {
        throw new InsufficientCryptoBalanceException()
      }
      await CashOutHoldService.assertAvailable(wallet, totalDebit, trx)
      await LimitService.assertWithinLimits(wallet, totalDebit, trx)

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
        { accountId: clearingAccount.id, direction: 'credit', amount: requestedAmount },
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
          description: `Crypto withdrawal of ${requestedAmount.amount} ${currencyCode} (${tokenSymbol} to ${destination})`,
          amount: requestedAmount,
          paymentMethod: 'crypto',
          paymentChannel: `crypto_${tokenSymbol.toLowerCase()}_${network}`,
          fee: feeAmount,
          trx,
          metadata: {
            wallet_id: wallet.id,
            network,
            token_symbol: tokenSymbol,
            destination_address: destination,
            memo_tag: request.memoTag || null,
            gross_amount: requestedAmount.amount.toString(),
            fee_amount: feeAmount.toString(),
            network_fee: rail.networkFee.toString(),
            total_debit: totalDebit.toString(),
            currency_code: currencyCode,
          } satisfies PayoutMetadata,
        }
      )

      // In the review queue: nothing has left yet.
      txn.status = 'pending'
      txn.provider = 'manual'
      txn.providerReferenceId = randomUUID()
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: request.initiatedByType,
        actorId: request.initiatedById,
        action: 'transaction.crypto_payout.requested',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          amount: requestedAmount.amount.toString(),
          fee: feeAmount.toString(),
          network,
          token: tokenSymbol,
          destination,
          status: txn.status,
        },
        correlationId: request.correlationId,
        trx,
      })

      announce(trx, txn)
      return txn
    })
  }

  /**
   * Staff sent the tokens: record the hash. The withdrawal completes only once the chain shows
   * that exact transfer (see confirmSent).
   */
  static async markSent(
    transactionId: string,
    txHash: string,
    reviewerId: number,
    correlationId: string
  ) {
    const hash = txHash.trim().toLowerCase()
    if (!/^0x[0-9a-f]{64}$/.test(hash)) {
      throw new CryptoPayoutException(
        'A transaction hash is 0x followed by 64 hex characters',
        'INVALID_TX_HASH'
      )
    }

    return db.transaction(async (trx) => {
      const txn = await CryptoPayoutService.lockPayout(transactionId, trx)
      const metadata = metadataOf(txn)
      if (
        txn.status !== 'pending' &&
        !(txn.status === 'processing' && metadata.verification_issue)
      ) {
        throw new CryptoPayoutException(
          `This withdrawal is ${txn.status}`,
          'CRYPTO_PAYOUT_STATE',
          409
        )
      }

      // The same on-chain transfer cannot settle two withdrawals.
      const reused = await LedgerTransaction.query({ client: trx })
        .where('type', 'crypto_payout')
        .whereNot('id', txn.id)
        .whereRaw("metadata->>'tx_hash' = ?", [hash])
        .first()
      if (reused) {
        throw new CryptoPayoutException(
          `This hash already settles withdrawal ${reused.id}`,
          'TX_HASH_ALREADY_USED',
          409
        )
      }

      const before = { status: txn.status, tx_hash: metadata.tx_hash ?? null }
      txn.status = 'processing'
      txn.metadata = {
        ...metadata,
        tx_hash: hash,
        sent_by: reviewerId,
        sent_at: DateTime.now().toISO(),
        confirmations: 0,
        verification_issue: null,
      }
      await txn.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: reviewerId,
        action: 'transaction.crypto_payout.sent',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before,
        after: { status: txn.status, tx_hash: hash },
        correlationId,
        trx,
      })

      announce(trx, txn)
      return txn
    })
  }

  /**
   * Staff refuse the withdrawal: the user gets everything back, fees included. Only while nothing
   * has been confirmed on-chain — a pending request, or a sent one the chain contradicts.
   */
  static async reject(
    transactionId: string,
    reason: string,
    reviewerId: number,
    correlationId: string
  ) {
    const txn = await LedgerTransaction.find(transactionId)
    if (!txn || txn.type !== 'crypto_payout') throw new CryptoPayoutNotFoundException()
    const metadata = metadataOf(txn)
    if (txn.status !== 'pending' && !(txn.status === 'processing' && metadata.verification_issue)) {
      throw new CryptoPayoutException(
        `This withdrawal is ${txn.status}`,
        'CRYPTO_PAYOUT_STATE',
        409
      )
    }

    await AuditLoggerService.record({
      actorType: 'internal_user',
      actorId: reviewerId,
      action: 'transaction.crypto_payout.rejected',
      resourceType: 'ledger_transaction',
      resourceId: txn.id,
      before: { status: txn.status },
      after: { reason },
      correlationId,
    })
    return CryptoPayoutService.failPayout(transactionId, reason)
  }

  /** Re-reads every sent withdrawal from the chain; completes the ones that are final. */
  static async confirmSent(
    chain: ChainReader = new AlchemyProvider()
  ): Promise<{ completed: number; flagged: number; waiting: number }> {
    const sent = await LedgerTransaction.query()
      .where('type', 'crypto_payout')
      .where('status', 'processing')
      .whereRaw("metadata->>'tx_hash' IS NOT NULL")
      .orderBy('created_at')
      .limit(200)

    const tally = { completed: 0, flagged: 0, waiting: 0 }
    const latestBlock = new Map<string, number>()
    for (const txn of sent) {
      const metadata = metadataOf(txn)
      if (metadata.verification_issue) continue // waiting for staff
      try {
        if (!latestBlock.has(metadata.network)) {
          latestBlock.set(metadata.network, await chain.getBlockNumber(metadata.network))
        }
        tally[await CryptoPayoutService.verify(txn, chain, latestBlock.get(metadata.network)!)]++
      } catch (error) {
        logger.error({ err: error, payoutId: txn.id }, 'crypto payout confirmation failed')
        tally.waiting++
      }
    }
    return tally
  }

  private static async verify(
    txn: LedgerTransaction,
    chain: ChainReader,
    latestBlock: number
  ): Promise<'completed' | 'flagged' | 'waiting'> {
    const metadata = metadataOf(txn)
    const spec = networkSpec(metadata.network)
    const contract = spec?.contracts[metadata.token_symbol]
    if (!spec || !contract) return CryptoPayoutService.flag(txn, 'network_not_served')

    const receipt = await chain.getTransactionReceipt(metadata.network, metadata.tx_hash!)
    if (!receipt) {
      const sentAt = metadata.sent_at ? DateTime.fromISO(metadata.sent_at) : txn.createdAt
      if (DateTime.now() > sentAt.plus({ hours: NOT_FOUND_FLAG_HOURS })) {
        return CryptoPayoutService.flag(txn, 'tx_not_found')
      }
      return 'waiting'
    }
    if (receipt.status !== '0x1') return CryptoPayoutService.flag(txn, 'tx_reverted')

    const expected = AlchemyProvider.convertHundredthsToRawToken(
      BigInt(metadata.gross_amount),
      contract.decimals
    )
    const destination = metadata.destination_address.toLowerCase()
    const paid = (receipt.logs ?? []).some(
      (log: any) =>
        !log.removed &&
        String(log.address).toLowerCase() === contract.address &&
        String(log.topics?.[0]).toLowerCase() === TRANSFER_TOPIC &&
        `0x${String(log.topics?.[2]).slice(-40)}`.toLowerCase() === destination &&
        BigInt(log.data) === expected
    )
    // The hash exists but is not this withdrawal: wrong token, address or amount.
    if (!paid) return CryptoPayoutService.flag(txn, 'transfer_mismatch')

    const confirmations = Math.max(0, latestBlock - Number(receipt.blockNumber) + 1)
    if (confirmations < spec.confirmations) {
      if (confirmations !== metadata.confirmations) {
        txn.metadata = { ...metadata, confirmations }
        await txn.save()
        Realtime.toUser(txn.initiatedByType === 'user' ? txn.initiatedById : null, {
          type: 'crypto_payout.updated',
          id: txn.id,
          status: txn.status,
        })
      }
      return 'waiting'
    }

    txn.metadata = { ...metadata, confirmations }
    await txn.save()
    await CryptoPayoutService.completePayout(txn.id, metadata.tx_hash!)
    return 'completed'
  }

  /** The chain contradicts the recorded hash: staff must look, nothing is refunded by itself. */
  private static async flag(txn: LedgerTransaction, issue: string): Promise<'flagged'> {
    txn.metadata = { ...metadataOf(txn), verification_issue: issue }
    await txn.save()
    logger.warn({ payoutId: txn.id, issue }, 'crypto payout needs staff attention')
    return 'flagged'
  }

  private static async lockPayout(transactionId: string, trx: TransactionClientContract) {
    const txn = await LedgerTransaction.query({ client: trx })
      .where('id', transactionId)
      .where('type', 'crypto_payout')
      .forUpdate()
      .first()
    if (!txn) throw new CryptoPayoutNotFoundException()
    return txn
  }

  /** Marks a payout completed once its on-chain transfer is confirmed. */
  static async completePayout(transactionId: string, txHash: string): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await CryptoPayoutService.lockPayout(transactionId, trx)
      if (txn.status === 'completed') return txn

      txn.status = 'completed'
      txn.completedAt = DateTime.now()
      txn.metadata = { ...metadataOf(txn), tx_hash: txHash, completed_at: DateTime.now().toISO() }
      await txn.useTransaction(trx).save()

      if (txn.initiatedByType === 'business') {
        await notifyBusinessWebhook(txn, 'crypto_payout.completed', trx)
      }
      // One outbox event, one receipt e-mail (see handleCryptoPayoutTerminal).
      await TransactionNotifier.enqueueEmail(txn, 'crypto_payout.completed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'crypto_payout.completed',
        title: 'Crypto withdrawal completed',
        message: `Your withdrawal of ${txn.amount} ${txn.currencyCode} was sent to ${metadataOf(txn).destination_address}.`,
        data: { transaction_id: txn.id, tx_hash: txHash },
      })

      announce(trx, txn)
      return txn
    })
  }

  /** Refunds a payout in full (amount and fees) and marks it failed. */
  static async failPayout(transactionId: string, reason: string): Promise<LedgerTransaction> {
    return db.transaction(async (trx) => {
      const txn = await CryptoPayoutService.lockPayout(transactionId, trx)
      if (txn.status === 'failed' || txn.status === 'reversed') return txn

      const metadata = metadataOf(txn)
      const wallet = await Wallet.query({ client: trx })
        .where('id', metadata.wallet_id)
        .forUpdate()
        .firstOrFail()
      const currencyCode = txn.currencyCode || 'USD'
      const grossAmount = BigInt(metadata.gross_amount)
      const feeAmount = BigInt(metadata.fee_amount ?? '0')

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CRYPTO_CLEARING_${metadata.network.toUpperCase()}`,
        `Crypto Clearing (${metadata.network.toUpperCase()})`,
        currencyCode,
        trx,
        'asset'
      )
      // Mirror of the request: the clearing gives back the amount, the fee account the fees.
      const refundEntries: Array<{
        accountId: number
        direction: 'debit' | 'credit'
        amount: Money
      }> = [
        {
          accountId: clearingAccount.id,
          direction: 'debit',
          amount: new Money(grossAmount, currencyCode),
        },
        {
          accountId: wallet.ledgerAccountId,
          direction: 'credit',
          amount: new Money(grossAmount + feeAmount, currencyCode),
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
        refundEntries.push({
          accountId: feeAccount.id,
          direction: 'debit',
          amount: new Money(feeAmount, currencyCode),
        })
      }

      await LedgerService.postTransaction('crypto_payout_refund', refundEntries, 'system', 0, {
        correlationId: `refund-${txn.correlationId}`,
        description: `Refund for crypto withdrawal ${txn.id}: ${reason}`,
        amount: new Money(grossAmount + feeAmount, currencyCode),
        reversalOfTransactionId: txn.id,
        trx,
      })

      txn.status = 'failed'
      txn.failureReason = reason
      txn.completedAt = DateTime.now()
      txn.metadata = { ...metadata, failure_reason: reason }
      await txn.useTransaction(trx).save()

      if (txn.initiatedByType === 'business') {
        await notifyBusinessWebhook(txn, 'crypto_payout.failed', trx)
      }
      await TransactionNotifier.enqueueEmail(txn, 'crypto_payout.failed', trx)
      await InAppNotificationService.notify({
        recipientType: txn.initiatedByType as 'user' | 'business',
        recipientId: txn.initiatedById,
        type: 'crypto_payout.failed',
        title: 'Crypto withdrawal refused',
        message: `Your crypto withdrawal was refused: ${reason}. The full amount was refunded to your account.`,
        data: { transaction_id: txn.id },
      })

      announce(trx, txn)
      return txn
    })
  }

  /** A withdrawal as the app and the back office show it. */
  static present(txn: LedgerTransaction) {
    const metadata = metadataOf(txn)
    return {
      id: txn.id,
      status: txn.status,
      network: metadata.network,
      token_symbol: metadata.token_symbol,
      destination_address: metadata.destination_address,
      amount: metadata.gross_amount,
      fee: metadata.fee_amount,
      network_fee: metadata.network_fee ?? '0',
      total_debit: metadata.total_debit,
      currency_code: metadata.currency_code,
      tx_hash: metadata.tx_hash ?? null,
      confirmations: metadata.confirmations ?? 0,
      required_confirmations: networkSpec(metadata.network)?.confirmations ?? null,
      verification_issue: metadata.verification_issue ?? null,
      failure_reason: metadata.failure_reason ?? txn.failureReason ?? null,
      initiated_by_type: txn.initiatedByType,
      initiated_by_id: txn.initiatedById,
      created_at: txn.createdAt,
      sent_at: metadata.sent_at ?? null,
      completed_at: txn.completedAt,
    }
  }
}
