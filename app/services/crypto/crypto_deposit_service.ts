import { v4 as uuidv4 } from 'uuid'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import CryptoDeposit from '#models/crypto_deposit'
import CryptoDepositAddress from '#models/crypto_deposit_address'
import LedgerTransaction from '#models/ledger_transaction'
import Wallet from '#models/wallet'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { notifyBusinessWebhook } from '#services/webhooks/notify_business_webhook'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import { TransactionNotifier } from '#services/notifications/transaction_notifier'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import { AlchemyNotify } from '#services/crypto/alchemy_notify'
import { Realtime } from '#services/realtime/realtime'
import { CryptoAlerts } from '#services/crypto/crypto_alerts'
import { DepositAddressDeriver } from '#services/crypto/deposit_address_deriver'
import {
  availableDepositRails,
  networkSpec,
  TOKEN_CURRENCY,
  tokenForContract,
  type EvmNetwork,
  type StablecoinSymbol,
} from '#services/crypto/crypto_networks'

/** keccak256("Transfer(address,address,uint256)") — topic 0 of every ERC-20 transfer log. */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** A transfer the chain still does not know after this long was dropped or reorged away. */
const NOT_FOUND_GIVE_UP_HOURS = 6

export type DepositOwner = { type: 'user' | 'business'; id: number }

/** What the confirmation job needs from a node. AlchemyProvider is the real one. */
export interface ChainReader {
  getTransactionReceipt(network: string, txHash: string): Promise<any>
  getBlockNumber(network: string): Promise<number>
}

export class CryptoDepositRailUnavailableException extends Error {
  constructor(network: string, tokenSymbol: string) {
    super(`${tokenSymbol} deposits on ${network} are not available`)
    this.name = 'CryptoDepositRailUnavailableException'
  }
}

export class CryptoDepositCurrencyMismatchException extends Error {
  constructor(tokenSymbol: string, expected: string, requested: string) {
    super(`${tokenSymbol} can only be credited to a ${expected} wallet, not ${requested}`)
    this.name = 'CryptoDepositCurrencyMismatchException'
  }
}

export class CryptoDepositWalletMissingException extends Error {
  constructor(currencyCode: string) {
    super(
      `Active wallet not found for currency ${currencyCode}. Please open a ${currencyCode} wallet first.`
    )
    this.name = 'CryptoDepositWalletMissingException'
  }
}

/** An Alchemy report of a transfer to one of our addresses, before the chain has confirmed it. */
export type ReportedTransfer = {
  network: EvmNetwork
  txHash: string
  logIndex: number
  contractAddress: string
  toAddress: string
  fromAddress: string | null
  rawAmount: bigint
  blockNumber: bigint | null
}

function topicToAddress(topic: string | undefined): string {
  return topic ? `0x${topic.slice(-40)}`.toLowerCase() : ''
}

function primaryWallet(owner: DepositOwner, currencyCode: string, client?: any) {
  return Wallet.query(client ? { client } : undefined)
    .withScopes((scope) => scope.primary())
    .where(owner.type === 'user' ? 'user_id' : 'business_id', owner.id)
    .where('currency_code', currencyCode)
    .where('status', 'active')
    .first()
}

/**
 * Stablecoin deposits, end to end.
 *
 * 1. `requestAddress` hands out a real address (derived from the treasury xpub) and registers it
 *    with Alchemy before returning it, so nothing is ever sent to an address nobody watches.
 * 2. `recordReported` stores what the webhook announced — for a known token contract and a
 *    known address only — as a `pending` deposit. A webhook never credits by itself.
 * 3. `confirmPending` (the crypto_deposit_confirmation job) re-reads each pending transfer from
 *    the chain: the receipt must have succeeded, the log must be a Transfer of that contract to
 *    that address for that amount, and enough blocks must sit on top. Only then is the wallet
 *    credited, in the currency the token is pegged to.
 */
export class CryptoDepositService {
  static async requestAddress(params: {
    owner: DepositOwner
    network: EvmNetwork
    tokenSymbol: StablecoinSymbol
    currencyCode?: string
  }): Promise<{ address: CryptoDepositAddress; wallet: Wallet }> {
    const { owner, network, tokenSymbol } = params
    const rail = availableDepositRails().find(
      (item) => item.network === network && item.tokenSymbol === tokenSymbol
    )
    if (!rail) throw new CryptoDepositRailUnavailableException(network, tokenSymbol)

    const currencyCode = TOKEN_CURRENCY[tokenSymbol]
    if (params.currencyCode && params.currencyCode.toUpperCase() !== currencyCode) {
      throw new CryptoDepositCurrencyMismatchException(
        tokenSymbol,
        currencyCode,
        params.currencyCode
      )
    }

    const ownerColumn = owner.type === 'user' ? 'user_id' : 'business_id'

    return db.transaction(async (trx) => {
      const wallet = await primaryWallet(owner, currencyCode, trx)
      if (!wallet) throw new CryptoDepositWalletMissingException(currencyCode)
      // Serialises concurrent first requests from the same owner: both would otherwise draw a
      // fresh derivation index.
      await Wallet.query({ client: trx }).where('id', wallet.id).forUpdate().first()

      const existing = await CryptoDepositAddress.query({ client: trx })
        .where(ownerColumn, owner.id)
        .where('network', network)
        .where('token_symbol', tokenSymbol)
        .where('status', 'active')
        .whereNotNull('derivation_index')
        .first()
      if (existing) {
        // Shown again: a deposit is likely soon, so the reconciliation keeps watching it.
        existing.lastRequestedAt = DateTime.now()
        await existing.useTransaction(trx).save()
        return { address: existing, wallet }
      }

      // One index per owner: the same address on every network and token.
      const sibling = await CryptoDepositAddress.query({ client: trx })
        .where(ownerColumn, owner.id)
        .whereNotNull('derivation_index')
        .first()
      let index = sibling?.derivationIndex ?? null
      if (index === null) {
        const row = await trx.rawQuery("SELECT nextval('crypto_deposit_derivation_seq') AS index")
        index = Number(row.rows[0].index)
      }

      const address = DepositAddressDeriver.deriveAddress(index)
      const record = new CryptoDepositAddress()
      record.useTransaction(trx)
      record.userId = owner.type === 'user' ? owner.id : null
      record.businessId = owner.type === 'business' ? owner.id : null
      record.walletId = wallet.id
      record.network = network
      record.tokenSymbol = tokenSymbol
      record.address = address
      record.derivationIndex = index
      record.status = 'active'
      record.lastRequestedAt = DateTime.now()
      await record.save()

      // Inside the transaction on purpose: if Alchemy refuses, the address is rolled back and
      // never shown, rather than shown and never watched.
      await AlchemyNotify.watch(network, address)

      return { address: record, wallet }
    })
  }

  /**
   * Stores a transfer Alchemy reported. Returns `null` for anything we do not credit: another
   * token (whatever symbol it claims — only the contract address counts) or an address that is
   * not one of ours.
   */
  static async recordReported(report: ReportedTransfer): Promise<CryptoDeposit | null> {
    const token = tokenForContract(report.network, report.contractAddress)
    if (!token) return null

    const toAddress = report.toAddress.toLowerCase()
    const depositAddress = await CryptoDepositAddress.query()
      .where('address', toAddress)
      .where('status', 'active')
      .whereNotNull('derivation_index')
      .first()
    if (!depositAddress) return null

    const key = {
      network: report.network,
      txHash: report.txHash.toLowerCase(),
      logIndex: report.logIndex,
    }
    try {
      const deposit = await CryptoDeposit.firstOrCreate(key, {
        ...key,
        tokenSymbol: token.symbol,
        contractAddress: token.address,
        toAddress,
        fromAddress: report.fromAddress?.toLowerCase() ?? null,
        rawAmount: report.rawAmount.toString(),
        blockNumber: report.blockNumber,
        depositAddressId: depositAddress.id,
        status: 'pending',
      })
      // New on our side: the app shows it as pending right away.
      if (deposit.$isLocal) {
        Realtime.toUser(depositAddress.userId, {
          type: 'crypto_deposit.updated',
          id: deposit.id,
          status: deposit.status,
        })
      }
      return deposit
    } catch (error) {
      // Two deliveries of the same event raced past firstOrCreate: the unique key kept one.
      const stored = await CryptoDeposit.query()
        .where('network', key.network)
        .where('tx_hash', key.txHash)
        .where('log_index', key.logIndex)
        .first()
      if (stored) return stored
      throw error
    }
  }

  /** Checks every pending deposit against the chain; credits the ones that are final. */
  static async confirmPending(
    chain: ChainReader = new AlchemyProvider()
  ): Promise<{ credited: number; rejected: number; waiting: number }> {
    const pending = await CryptoDeposit.query().where('status', 'pending').orderBy('id').limit(200)
    const tally = { credited: 0, rejected: 0, waiting: 0 }
    const latestBlock = new Map<string, number>()

    for (const deposit of pending) {
      try {
        if (!latestBlock.has(deposit.network)) {
          latestBlock.set(deposit.network, await chain.getBlockNumber(deposit.network))
        }
        const outcome = await CryptoDepositService.verify(
          deposit,
          chain,
          latestBlock.get(deposit.network)!
        )
        tally[outcome]++
      } catch (error) {
        // A node hiccup on one deposit must not stall the others; it is retried next tick.
        logger.error({ err: error, depositId: deposit.id }, 'crypto deposit confirmation failed')
        tally.waiting++
      }
    }
    return tally
  }

  private static async verify(
    deposit: CryptoDeposit,
    chain: ChainReader,
    latestBlock: number
  ): Promise<'credited' | 'rejected' | 'waiting'> {
    const receipt = await chain.getTransactionReceipt(deposit.network, deposit.txHash)

    if (!receipt) {
      const giveUpAt = deposit.createdAt.plus({ hours: NOT_FOUND_GIVE_UP_HOURS })
      if (DateTime.now() > giveUpAt) {
        await CryptoDepositService.reject(deposit, 'not_found_on_chain')
        return 'rejected'
      }
      return 'waiting'
    }

    if (receipt.status !== '0x1') {
      await CryptoDepositService.reject(deposit, 'reverted')
      return 'rejected'
    }

    const log = (receipt.logs ?? []).find(
      (entry: any) => Number(entry.logIndex) === deposit.logIndex
    )
    const matches =
      log &&
      !log.removed &&
      String(log.address).toLowerCase() === deposit.contractAddress &&
      String(log.topics?.[0]).toLowerCase() === TRANSFER_TOPIC &&
      topicToAddress(log.topics?.[2]) === deposit.toAddress &&
      BigInt(log.data) === BigInt(deposit.rawAmount)
    if (!matches) {
      // The webhook described a transfer the chain does not contain: never credit it.
      await CryptoDepositService.reject(deposit, 'log_mismatch')
      return 'rejected'
    }

    const blockNumber = Number(receipt.blockNumber)
    deposit.blockNumber = BigInt(blockNumber)
    deposit.fromAddress = topicToAddress(log.topics?.[1]) || deposit.fromAddress
    const confirmations = Math.max(0, latestBlock - blockNumber + 1)
    const progressed = confirmations !== deposit.confirmations
    deposit.confirmations = confirmations
    await deposit.save()

    const required = networkSpec(deposit.network)?.confirmations ?? Number.POSITIVE_INFINITY
    if (deposit.confirmations < required) {
      // « 12/64 confirmations » moves on screen without the app polling.
      if (progressed) await CryptoDepositService.notifyOwner(deposit)
      return 'waiting'
    }

    return (await CryptoDepositService.credit(deposit.id)) ? 'credited' : 'rejected'
  }

  /** Tells the deposit's owner (a user, not a business) that it changed. */
  private static async notifyOwner(deposit: CryptoDeposit) {
    const address = await CryptoDepositAddress.find(deposit.depositAddressId)
    Realtime.toUser(address?.userId, {
      type: 'crypto_deposit.updated',
      id: deposit.id,
      status: deposit.status,
    })
  }

  private static async reject(deposit: CryptoDeposit, reason: string) {
    deposit.status = 'rejected'
    deposit.rejectReason = reason
    await deposit.save()
    await CryptoDepositService.notifyOwner(deposit)
    CryptoAlerts.raise(
      'deposit_rejected',
      String(deposit.id),
      'Dépôt crypto non crédité',
      `Le dépôt #${deposit.id} (${deposit.tokenSymbol} sur ${deposit.network}) n'a pas été crédité : ${reason}.`,
      { depot: deposit.id, hash: deposit.txHash, raison: reason }
    )
    logger.warn(
      { depositId: deposit.id, reason, txHash: deposit.txHash },
      'crypto deposit rejected'
    )
  }

  /** Posts the ledger entry for a confirmed deposit. `false` when it could not be credited. */
  private static async credit(depositId: number): Promise<boolean> {
    return db.transaction(async (trx) => {
      const deposit = await CryptoDeposit.query({ client: trx })
        .where('id', depositId)
        .forUpdate()
        .firstOrFail()
      if (deposit.status !== 'pending') return deposit.status === 'credited'

      const depositAddress = await CryptoDepositAddress.findOrFail(deposit.depositAddressId, {
        client: trx,
      })
      const owner: DepositOwner = depositAddress.userId
        ? { type: 'user', id: depositAddress.userId }
        : { type: 'business', id: depositAddress.businessId! }

      const tokenSymbol = deposit.tokenSymbol as StablecoinSymbol
      const currencyCode = TOKEN_CURRENCY[tokenSymbol]
      const decimals =
        tokenForContract(deposit.network as EvmNetwork, deposit.contractAddress)?.decimals ?? 6

      // The address's own wallet when it still fits; otherwise the owner's wallet in the peg
      // currency — a USDT transfer to an address handed out for USDC still credits dollars.
      let wallet = await Wallet.query({ client: trx })
        .where('id', depositAddress.walletId)
        .forUpdate()
        .first()
      if (!wallet || wallet.status !== 'active' || wallet.currencyCode !== currencyCode) {
        const fallback = await primaryWallet(owner, currencyCode, trx)
        wallet = fallback
          ? await Wallet.query({ client: trx }).where('id', fallback.id).forUpdate().first()
          : null
      }
      if (!wallet) {
        // The funds sit on a treasury-controlled key: support credits or returns them by hand.
        deposit.status = 'rejected'
        deposit.rejectReason = 'no_wallet'
        await deposit.useTransaction(trx).save()
        trx.after('commit', () =>
          CryptoAlerts.raise(
            'deposit_rejected',
            String(deposit.id),
            'Dépôt crypto non crédité',
            `Le dépôt #${deposit.id} (${deposit.tokenSymbol} sur ${deposit.network}) attend l'équipe : no_wallet.`,
            { depot: deposit.id, hash: deposit.txHash, raison: 'no_wallet' }
          )
        )
        Realtime.toUserAfterCommit(trx, depositAddress.userId, {
          type: 'crypto_deposit.updated',
          id: deposit.id,
          status: deposit.status,
        })
        return false
      }

      const hundredths = AlchemyProvider.convertRawTokenToHundredths(deposit.rawAmount, decimals)
      if (hundredths <= 0n) {
        deposit.status = 'rejected'
        deposit.rejectReason = 'dust'
        await deposit.useTransaction(trx).save()
        trx.after('commit', () =>
          CryptoAlerts.raise(
            'deposit_rejected',
            String(deposit.id),
            'Dépôt crypto non crédité',
            `Le dépôt #${deposit.id} (${deposit.tokenSymbol} sur ${deposit.network}) attend l'équipe : dust.`,
            { depot: deposit.id, hash: deposit.txHash, raison: 'dust' }
          )
        )
        Realtime.toUserAfterCommit(trx, depositAddress.userId, {
          type: 'crypto_deposit.updated',
          id: deposit.id,
          status: deposit.status,
        })
        return false
      }

      const providerReferenceId = `${deposit.network}:${deposit.txHash}:${deposit.logIndex}`
      const already = await LedgerTransaction.query({ client: trx })
        .where('provider', 'alchemy')
        .where('provider_reference_id', providerReferenceId)
        .first()
      if (already) {
        deposit.status = 'credited'
        deposit.ledgerTransactionId = already.id
        deposit.creditedAt = already.completedAt ?? DateTime.now()
        await deposit.useTransaction(trx).save()
        return true
      }

      const grossAmount = new Money(hundredths, currencyCode)
      const feePercent = await FeeScheduleService.getFeePercent('crypto_deposit')
      const feeBps = BigInt(Math.round(feePercent * 100))
      const feeAmount = (grossAmount.amount * feeBps + 5000n) / 10000n
      const netToUser = grossAmount.amount - feeAmount

      const clearingAccount = await LedgerService.getOrCreatePlatformAccount(
        `CRYPTO_CLEARING_${deposit.network.toUpperCase()}`,
        `Crypto Clearing (${deposit.network.toUpperCase()})`,
        currencyCode,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        { accountId: clearingAccount.id, direction: 'debit', amount: grossAmount },
        {
          accountId: wallet.ledgerAccountId,
          direction: 'credit',
          amount: new Money(netToUser, currencyCode),
        },
      ]
      if (feeAmount > 0n) {
        const feeAccount = await LedgerService.getOrCreatePlatformAccount(
          'PLATFORM_FEE_CRYPTO_DEPOSIT',
          'Platform Fee - Crypto Deposit',
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

      const correlationId = `crypto-dep-${uuidv4()}`
      const txn = await LedgerService.postTransaction(
        'crypto_deposit',
        entries,
        owner.type,
        owner.id,
        {
          correlationId,
          description: `Crypto deposit of ${tokenSymbol} on ${deposit.network} (${grossAmount.amount} ${currencyCode})`,
          amount: grossAmount,
          paymentMethod: 'crypto',
          paymentChannel: `crypto_${tokenSymbol.toLowerCase()}_${deposit.network}`,
          fee: feeAmount,
          trx,
          metadata: {
            network: deposit.network,
            token_symbol: tokenSymbol,
            tx_hash: deposit.txHash,
            from_address: deposit.fromAddress,
            to_address: deposit.toAddress,
            raw_amount: deposit.rawAmount,
            block_number: deposit.blockNumber?.toString(),
            confirmations: deposit.confirmations,
            deposit_address_id: depositAddress.id,
            crypto_deposit_id: deposit.id,
            wallet_id: wallet.id,
          },
        }
      )

      txn.provider = 'alchemy'
      txn.providerReferenceId = providerReferenceId
      txn.completedAt = DateTime.now()
      await txn.useTransaction(trx).save()

      deposit.status = 'credited'
      deposit.ledgerTransactionId = txn.id
      deposit.creditedAt = DateTime.now()
      await deposit.useTransaction(trx).save()

      // After commit only. The balance itself is announced by the ledger posting above.
      Realtime.toUserAfterCommit(trx, depositAddress.userId, {
        type: 'crypto_deposit.updated',
        id: deposit.id,
        status: deposit.status,
      })

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
          network: deposit.network,
          tx_hash: deposit.txHash,
          confirmations: deposit.confirmations,
        },
        correlationId,
        trx,
      })

      if (owner.type === 'business') {
        await notifyBusinessWebhook(txn, 'crypto_deposit.completed', trx)
      }
      // The receipt e-mail goes through the outbox (see handleCryptoDepositCompleted); one event
      // per deposit, or the user would get the e-mail twice.
      await TransactionNotifier.enqueueEmail(txn, 'crypto_deposit.completed', trx)
      await InAppNotificationService.notify({
        recipientType: owner.type,
        recipientId: owner.id,
        type: 'crypto_deposit.completed',
        title: 'Crypto deposit received',
        message: `Your deposit of ${tokenSymbol} on ${deposit.network} was received and credited to your wallet.`,
        data: { transaction_id: txn.id, tx_hash: deposit.txHash },
      })

      return true
    })
  }

  /** An owner's deposits, newest first, pending ones included — what a "Dépôts crypto" screen lists. */
  static async listFor(owner: DepositOwner, page: number, limit: number) {
    const ownerColumn =
      owner.type === 'user'
        ? 'crypto_deposit_addresses.user_id'
        : 'crypto_deposit_addresses.business_id'
    const result = await CryptoDeposit.query()
      .join(
        'crypto_deposit_addresses',
        'crypto_deposit_addresses.id',
        'crypto_deposits.deposit_address_id'
      )
      .where(ownerColumn, owner.id)
      .select('crypto_deposits.*')
      .orderBy('crypto_deposits.id', 'desc')
      .paginate(page, limit)

    return {
      data: result.all().map((deposit) => {
        const tokenSymbol = deposit.tokenSymbol as StablecoinSymbol
        const decimals =
          tokenForContract(deposit.network as EvmNetwork, deposit.contractAddress)?.decimals ?? 6
        return {
          id: deposit.id,
          network: deposit.network,
          token_symbol: tokenSymbol,
          amount: AlchemyProvider.convertRawTokenToHundredths(
            deposit.rawAmount,
            decimals
          ).toString(),
          currency_code: TOKEN_CURRENCY[tokenSymbol],
          status: deposit.status,
          reject_reason: deposit.rejectReason,
          confirmations: deposit.confirmations,
          required_confirmations: networkSpec(deposit.network)?.confirmations ?? null,
          tx_hash: deposit.txHash,
          transaction_id: deposit.ledgerTransactionId,
          created_at: deposit.createdAt,
          credited_at: deposit.creditedAt,
        }
      }),
      meta: result.getMeta(),
    }
  }
}
