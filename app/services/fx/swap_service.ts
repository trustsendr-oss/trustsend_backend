import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import FxQuote from '#models/fx_quote'
import Wallet from '#models/wallet'
import type LedgerTransaction from '#models/ledger_transaction'
import { Money } from '#services/money/money'
import { CurrencyService } from '#services/money/currency_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { ExchangeRateService } from '#services/fx/exchange_rate_service'
import { convert, formatRate, parseRate } from '#services/fx/fx_math'
import {
  InsufficientBalanceException,
  TransactionLimitExceededException,
} from '#services/transactions/p2p_transfer_service'

/** How long a quoted rate is honoured. */
export const QUOTE_TTL_SECONDS = 60

export type SwapOwner = { type: 'user' | 'business'; id: number }

export class SameCurrencySwapException extends Error {
  constructor() {
    super('Choose two different currencies')
    this.name = 'SameCurrencySwapException'
  }
}

export class SwapWalletNotFoundException extends Error {
  constructor(readonly currencyCode: string) {
    super(`Active wallet not found for currency ${currencyCode}`)
    this.name = 'SwapWalletNotFoundException'
  }
}

export class SwapAmountTooSmallException extends Error {
  constructor() {
    super('Amount is too small to be converted')
    this.name = 'SwapAmountTooSmallException'
  }
}

export class QuoteNotFoundException extends Error {
  constructor() {
    super('Quote not found')
    this.name = 'QuoteNotFoundException'
  }
}

export class QuoteExpiredException extends Error {
  constructor() {
    super('Quote has expired, request a new one')
    this.name = 'QuoteExpiredException'
  }
}

export class QuoteAlreadyUsedException extends Error {
  constructor() {
    super('Quote has already been used')
    this.name = 'QuoteAlreadyUsedException'
  }
}

const OWNER_COLUMN = { user: 'user_id', business: 'business_id' } as const
const WALLET_OWNER_TYPE = { user: 'user_wallet', business: 'business_wallet' } as const

/**
 * Converts money between two wallets of the same owner, in two steps: a quote locks the rate for
 * QUOTE_TTL_SECONDS, then executing it posts one balanced ledger transaction.
 *
 * Ledger entries (per currency, each side balances on its own):
 *   from wallet            debit   amount_in   (from currency)
 *   FX_POSITION.<from>     credit  amount_in
 *   FX_POSITION.<to>       debit   amount_out + fee   (to currency)
 *   to wallet              credit  amount_out
 *   FX_REVENUE.<to>        credit  fee
 * FX_POSITION.<currency> is the platform's exposure in that currency across all swaps.
 */
export class SwapService {
  static async findWallet(owner: SwapOwner, currencyCode: string): Promise<Wallet | null> {
    return Wallet.query()
      .where(OWNER_COLUMN[owner.type], owner.id)
      .where('currency_code', currencyCode)
      .where('status', 'active')
      .first()
  }

  static async createQuote(
    owner: SwapOwner,
    input: { fromCurrency: string; toCurrency: string; amountIn: bigint }
  ): Promise<FxQuote> {
    const fromCode = CurrencyService.normalize(input.fromCurrency)
    const toCode = CurrencyService.normalize(input.toCurrency)
    if (fromCode === toCode) throw new SameCurrencySwapException()

    await CurrencyService.requireActive(fromCode)
    const toCurrency = await CurrencyService.requireActive(toCode)

    const fromWallet = await this.findWallet(owner, fromCode)
    if (!fromWallet) throw new SwapWalletNotFoundException(fromCode)
    const toWallet = await this.findWallet(owner, toCode)
    if (!toWallet) throw new SwapWalletNotFoundException(toCode)

    if (fromWallet.balanceCache < input.amountIn) {
      throw new InsufficientBalanceException(fromWallet.id, input.amountIn, fromWallet.balanceCache)
    }

    await ExchangeRateService.refreshIfStale([fromCode, toCode])
    const pair = await ExchangeRateService.pairRate(fromCode, toCode)

    const conversion = convert({
      amountIn: input.amountIn,
      fromPerUsd: pair.from.perUsd,
      toPerUsd: pair.to.perUsd,
      marginBps: pair.marginBps,
      toDecimals: toCurrency.decimals,
    })
    if (conversion.amountOut <= 0n) throw new SwapAmountTooSmallException()

    return FxQuote.create({
      id: randomUUID(),
      ownerType: owner.type,
      ownerId: owner.id,
      fromWalletId: fromWallet.id,
      toWalletId: toWallet.id,
      fromCurrency: fromCode,
      toCurrency: toCode,
      amountIn: input.amountIn,
      amountOut: conversion.amountOut,
      fee: conversion.fee,
      midRate: formatRate(pair.midRate, 12),
      rate: formatRate(pair.rate, 12),
      marginBps: pair.marginBps,
      expiresAt: DateTime.now().plus({ seconds: QUOTE_TTL_SECONDS }),
      usedAt: null,
      ledgerTransactionId: null,
    })
  }

  static async execute(
    owner: SwapOwner,
    input: { quoteId: string; idempotencyKey: string; correlationId: string }
  ): Promise<{ transaction: LedgerTransaction; quote: FxQuote }> {
    return db.transaction(async (trx) => {
      const quote = await FxQuote.query({ client: trx })
        .where('id', input.quoteId)
        .where('owner_type', owner.type)
        .where('owner_id', owner.id)
        .forUpdate()
        .first()

      if (!quote) throw new QuoteNotFoundException()
      if (quote.usedAt) throw new QuoteAlreadyUsedException()
      if (quote.expiresAt < DateTime.now()) throw new QuoteExpiredException()

      const walletIds = [quote.fromWalletId, quote.toWalletId].sort((a, b) => a - b)
      const wallets = await Wallet.query({ client: trx })
        .whereIn('id', walletIds)
        .where(OWNER_COLUMN[owner.type], owner.id)
        .orderBy('id', 'asc')
        .forUpdate()

      const fromWallet = wallets.find((w) => w.id === quote.fromWalletId)
      const toWallet = wallets.find((w) => w.id === quote.toWalletId)
      if (!fromWallet || fromWallet.status !== 'active' || fromWallet.currencyCode !== quote.fromCurrency) {
        throw new SwapWalletNotFoundException(quote.fromCurrency)
      }
      if (!toWallet || toWallet.status !== 'active' || toWallet.currencyCode !== quote.toCurrency) {
        throw new SwapWalletNotFoundException(quote.toCurrency)
      }

      if (fromWallet.balanceCache < quote.amountIn) {
        throw new InsufficientBalanceException(fromWallet.id, quote.amountIn, fromWallet.balanceCache)
      }
      if (fromWallet.perTransactionLimit && quote.amountIn > fromWallet.perTransactionLimit) {
        throw new TransactionLimitExceededException(
          fromWallet.id,
          'per_transaction',
          fromWallet.perTransactionLimit,
          quote.amountIn
        )
      }
      await LimitService.assertWithinLimits(
        {
          id: fromWallet.id,
          ledgerAccountId: fromWallet.ledgerAccountId,
          dailyLimit: fromWallet.dailyLimit,
          monthlyLimit: fromWallet.monthlyLimit,
        },
        quote.amountIn,
        trx
      )

      const walletAccounts = await db
        .query()
        .from('ledger_accounts')
        .whereIn('owner_id', walletIds)
        .where('owner_type', WALLET_OWNER_TYPE[owner.type])
        .select('id', 'owner_id')
        .useTransaction(trx)
      const fromAccount = walletAccounts.find((a) => a.owner_id === fromWallet.id)
      const toAccount = walletAccounts.find((a) => a.owner_id === toWallet.id)
      if (!fromAccount || !toAccount) throw new Error('Ledger accounts not found for wallets')

      const fromPosition = await LedgerService.getOrCreatePlatformAccount(
        `FX_POSITION.${quote.fromCurrency}`,
        `FX position (${quote.fromCurrency})`,
        quote.fromCurrency,
        trx,
        'asset'
      )
      const toPosition = await LedgerService.getOrCreatePlatformAccount(
        `FX_POSITION.${quote.toCurrency}`,
        `FX position (${quote.toCurrency})`,
        quote.toCurrency,
        trx,
        'asset'
      )

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        { accountId: fromAccount.id, direction: 'debit', amount: new Money(quote.amountIn, quote.fromCurrency) },
        { accountId: fromPosition.id, direction: 'credit', amount: new Money(quote.amountIn, quote.fromCurrency) },
        {
          accountId: toPosition.id,
          direction: 'debit',
          amount: new Money(quote.amountOut + quote.fee, quote.toCurrency),
        },
        { accountId: toAccount.id, direction: 'credit', amount: new Money(quote.amountOut, quote.toCurrency) },
      ]

      if (quote.fee > 0n) {
        const revenue = await LedgerService.getOrCreatePlatformAccount(
          `FX_REVENUE.${quote.toCurrency}`,
          `FX revenue (${quote.toCurrency})`,
          quote.toCurrency,
          trx,
          'revenue'
        )
        entries.push({ accountId: revenue.id, direction: 'credit', amount: new Money(quote.fee, quote.toCurrency) })
      }

      const transaction = await LedgerService.postTransaction('fx_swap', entries, owner.type, owner.id, {
        idempotencyKey: `fx_swap:${owner.type}:${owner.id}:${input.idempotencyKey}`,
        correlationId: input.correlationId,
        description: `Currency swap ${quote.fromCurrency} to ${quote.toCurrency}`,
        metadata: {
          quote_id: quote.id,
          // amount/currency_code: the debited side, read by clients that list transactions
          amount: quote.amountIn.toString(),
          currency_code: quote.fromCurrency,
          from_wallet_id: fromWallet.id,
          to_wallet_id: toWallet.id,
          from_currency: quote.fromCurrency,
          to_currency: quote.toCurrency,
          amount_in: quote.amountIn.toString(),
          amount_out: quote.amountOut.toString(),
          fee: quote.fee.toString(),
          fee_currency: quote.toCurrency,
          rate: quote.rate,
          mid_rate: quote.midRate,
          margin_bps: quote.marginBps,
        },
        amount: new Money(quote.amountIn, quote.fromCurrency),
        paymentMethod: 'wallet',
        trx,
      })

      quote.usedAt = DateTime.now()
      quote.ledgerTransactionId = transaction.id
      await quote.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: owner.type,
        actorId: owner.id,
        action: 'transaction.fx_swap.completed',
        resourceType: 'ledger_transaction',
        resourceId: transaction.id,
        before: undefined,
        after: {
          quote_id: quote.id,
          from_currency: quote.fromCurrency,
          to_currency: quote.toCurrency,
          amount_in: quote.amountIn.toString(),
          amount_out: quote.amountOut.toString(),
          fee: quote.fee.toString(),
          rate: quote.rate,
        },
        correlationId: input.correlationId,
        trx,
      })

      return { transaction, quote }
    })
  }

  static serializeQuote(quote: FxQuote) {
    return {
      quote_id: quote.id,
      from_currency: quote.fromCurrency,
      to_currency: quote.toCurrency,
      amount_in: quote.amountIn.toString(),
      amount_out: quote.amountOut.toString(),
      fee: quote.fee.toString(),
      fee_currency: quote.toCurrency,
      rate: formatRate(parseRate(quote.rate)),
      mid_rate: formatRate(parseRate(quote.midRate)),
      margin_bps: quote.marginBps,
      expires_at: quote.expiresAt,
    }
  }

  static serializeSwap(transaction: LedgerTransaction, quote: FxQuote) {
    const { expires_at: _expiresAt, ...details } = this.serializeQuote(quote)
    return {
      transaction_id: transaction.id,
      transaction_uuid: transaction.uuid,
      status: transaction.status,
      ...details,
      created_at: transaction.createdAt,
    }
  }
}
