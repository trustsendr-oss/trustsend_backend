import { createHmac, randomInt, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import env from '#start/env'
import type Agent from '#models/agent'
import AuditLog from '#models/audit_log'
import KycVerification from '#models/kyc_verification'
import Remittance, { type RemittancePayoutMethod, type RemittanceStatus } from '#models/remittance'
import RemittanceQuote from '#models/remittance_quote'
import User from '#models/user'
import Wallet from '#models/wallet'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { ExchangeRateService } from '#services/fx/exchange_rate_service'
import { convert, formatRate } from '#services/fx/fx_math'
import { AgentFloatService } from '#services/agents/agent_float_service'
import { AgentLimitService } from '#services/agents/agent_limit_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { CurrencyService } from '#services/money/currency_service'
import { Money } from '#services/money/money'
import { InAppNotificationService } from '#services/notifications/in_app_notification_service'
import type { MobileMoneyProvider } from '#services/mobile_money/provider'
import { amountStepFor, type ProviderCurrencyConfig } from '#services/mobile_money/pawapay_provider'
import { ScreeningService } from '#services/remittances/screening_service'
import { CryptoService } from '#services/security/crypto_service'
import { IdGenerator } from '#services/security/id_generator'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'

/* -------------------------------------------------------------------------- */
/*                                   Policy                                   */
/* -------------------------------------------------------------------------- */

/** How long a quoted rate is honoured before the sender confirms. */
export const REMITTANCE_QUOTE_TTL_MINUTES = 5
/** How long a cash pickup stays payable before the sender is refunded in full. */
export const REMITTANCE_TTL_DAYS = 30
/** Agents' float is held in USD: cash is paid out in USD only for now. */
export const CASH_PAYOUT_CURRENCIES = ['USD']
/** A Reemite wallet in the DRC can receive either of the country's two currencies. */
export const WALLET_PAYOUT_CURRENCIES = ['USD', 'CDF']
/** DRC mobile money operators (via PawaPay) pay out in either currency, per operator. */
export const MOBILE_MONEY_PAYOUT_CURRENCIES = ['USD', 'CDF']
/** Wrong beneficiary phone numbers tolerated at the counter before the transfer is held. */
export const MAX_VERIFICATION_FAILURES = 5
/** Unknown pickup codes an agent may try per hour before lookups are refused. */
export const AGENT_LOOKUP_FAILURES_PER_HOUR = 10
const PICKUP_CODE_LENGTH = 10
/** The corridor served: into the DRC. A sender in the DRC uses a P2P transfer instead. */
export const PAYOUT_COUNTRY = 'CD'

/**
 * What a remittance needs from the mobile money integration: the payout call and status check
 * every provider has, plus the operator's limits (PawaPayProvider.getProviderConfig).
 */
export type RemittanceMobileMoneyProvider = MobileMoneyProvider & {
  getProviderConfig(
    currencyCode: string,
    providerCode: string,
    operationType: 'PAYOUT'
  ): Promise<ProviderCurrencyConfig | null>
}

/** A user-actionable refusal; controllers map it to its HTTP status and `code`. */
export class RemittanceException extends Error {
  constructor(
    message: string,
    public code: string,
    public status: 400 | 402 | 403 | 404 | 409 | 410 | 422 | 423 | 429 | 503 = 422
  ) {
    super(message)
    this.name = 'RemittanceException'
  }
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/** DRC mobile number → 243XXXXXXXXX, or null. Accepts 0812…, 812…, +243 812…, 243812…. */
export function normalizeDrcPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('243')) return digits
  if (digits.length === 10 && digits.startsWith('0')) return `243${digits.slice(1)}`
  if (digits.length === 9) return `243${digits}`
  return null
}

/** Pickup codes are looked up by HMAC, never stored or searched in clear. */
function hashCode(code: string): string {
  return createHmac('sha256', env.get('APP_KEY').release())
    .update(`remittance:${code}`)
    .digest('hex')
}

function generateCode(): string {
  let code = ''
  for (let i = 0; i < PICKUP_CODE_LENGTH; i++) code += randomInt(0, 10).toString()
  return code
}

function percentOf(amount: bigint, percent: number, roundUp: boolean): bigint {
  const bps = BigInt(Math.round(percent * 100))
  return roundUp ? (amount * bps + 9999n) / 10000n : (amount * bps) / 10000n
}

type Entry = { accountId: number; direction: 'debit' | 'credit'; amount: Money }

async function platform(
  code: string,
  name: string,
  currency: string,
  trx: TransactionClientContract,
  type: 'asset' | 'liability' | 'revenue' | 'expense'
) {
  return LedgerService.getOrCreatePlatformAccount(
    `${code}.${currency}`,
    `${name} (${currency})`,
    currency,
    trx,
    type
  )
}

async function walletAccountId(
  walletId: number,
  ownerType: 'user_wallet' | 'agent_wallet',
  trx: TransactionClientContract
): Promise<number> {
  const account = await db
    .from('ledger_accounts')
    .where('owner_id', walletId)
    .where('owner_type', ownerType)
    .select('id')
    .useTransaction(trx)
    .first()
  if (!account) throw new Error(`Ledger account not found for wallet ${walletId}`)
  return account.id
}

/* -------------------------------------------------------------------------- */
/*                                   Service                                  */
/* -------------------------------------------------------------------------- */

/**
 * International transfers into the DRC.
 *
 * Money path (ledger), with S the sender's currency and P the payout currency:
 * - send:   sender wallet S  →  REMITTANCE_FEES.S (fee)  +  [FX_POSITION.S → FX_POSITION.P]
 *           →  REMITTANCE_PAYABLE.P (what the beneficiary is owed)  +  FX_REVENUE.P (margin)
 * - payout: REMITTANCE_PAYABLE.P  →  agent float P (cash handed out)
 *           REMITTANCE_AGENT_COMMISSION.P (expense)  →  agent float P (commission)
 *           or REMITTANCE_PAYABLE.P  →  beneficiary wallet P
 * - refund: the send, reversed at the original rate — the sender gets back every unit paid.
 *
 * The rate is locked at send time: the payout amount the sender saw is what the beneficiary gets,
 * whenever they collect it. Each transaction balances per currency, as LedgerService requires.
 */
export class RemittanceService {
  /* ------------------------------ Eligibility ----------------------------- */

  /** International senders must be identified (FATF travel rule): approved KYC, every time. */
  static async assertKycApproved(userId: number) {
    const latest = await KycVerification.query()
      .where('subject_type', 'user')
      .where('subject_id', userId)
      .orderBy('created_at', 'desc')
      .first()
    if (latest?.status !== 'approved') {
      throw new RemittanceException(
        'Your identity must be verified before sending money abroad',
        'KYC_REQUIRED',
        403
      )
    }
  }

  static assertPayoutCurrency(method: RemittancePayoutMethod, currency: string) {
    const allowed = {
      cash_pickup: CASH_PAYOUT_CURRENCIES,
      wallet: WALLET_PAYOUT_CURRENCIES,
      mobile_money: MOBILE_MONEY_PAYOUT_CURRENCIES,
    }[method]
    if (!allowed.includes(currency)) {
      throw new RemittanceException(
        `This payout method pays in ${allowed.join(' or ')} only`,
        'PAYOUT_CURRENCY_UNSUPPORTED'
      )
    }
  }

  private static async sourceWallet(
    userId: number,
    currency: string,
    trx?: TransactionClientContract
  ) {
    const query = Wallet.query({ client: trx })
      .withScopes((s) => s.primary())
      .where('user_id', userId)
      .where('currency_code', currency)
      .where('status', 'active')
    if (trx) query.forUpdate()
    const wallet = await query.first()
    if (!wallet) {
      throw new RemittanceException(
        `You have no active ${currency} wallet`,
        'SOURCE_WALLET_NOT_FOUND',
        404
      )
    }
    return wallet
  }

  /* --------------------------------- Quote -------------------------------- */

  static async quote(
    user: User,
    input: {
      sourceCurrency: string
      payoutCurrency: string
      payoutMethod: RemittancePayoutMethod
      sendAmount: bigint
      /** Mobile money only: the PawaPay operator, e.g. VODACOM_MPESA_COD. */
      providerCode?: string
    },
    provider?: RemittanceMobileMoneyProvider
  ): Promise<RemittanceQuote> {
    const source = CurrencyService.normalize(input.sourceCurrency)
    const payout = CurrencyService.normalize(input.payoutCurrency)
    this.assertPayoutCurrency(input.payoutMethod, payout)
    await CurrencyService.requireActive(source)
    const payoutCurrency = await CurrencyService.requireActive(payout)

    const wallet = await this.sourceWallet(user.id, source)
    const fee = percentOf(
      input.sendAmount,
      await FeeScheduleService.getFeePercent('remittance'),
      true
    )

    let payoutAmount = input.sendAmount
    let fxMargin = 0n
    let midRate: string | null = '1'
    let rate: string | null = '1'

    if (source !== payout) {
      await ExchangeRateService.refreshIfStale([source, payout])
      const pair = await ExchangeRateService.pairRate(source, payout)
      const conversion = convert({
        amountIn: input.sendAmount,
        fromPerUsd: pair.from.perUsd,
        toPerUsd: pair.to.perUsd,
        marginBps: pair.marginBps,
        toDecimals: payoutCurrency.decimals,
      })
      payoutAmount = conversion.amountOut
      fxMargin = conversion.fee
      midRate = formatRate(pair.midRate, 12)
      rate = formatRate(pair.rate, 12)
    }

    // Mobile money: the operator decides what it can pay — its limits, and whether amounts carry
    // cents (CDF often does not). The amount is rounded down to what it accepts; in a converted
    // transfer the remainder stays with the platform as part of the FX margin.
    if (input.payoutMethod === 'mobile_money') {
      if (!input.providerCode || !provider) {
        throw new RemittanceException('Choose the mobile money operator', 'PROVIDER_REQUIRED')
      }
      const config = await provider.getProviderConfig(payout, input.providerCode, 'PAYOUT')
      if (!config) {
        throw new RemittanceException(
          `${input.providerCode} cannot receive ${payout}`,
          'PROVIDER_UNSUPPORTED'
        )
      }
      if (config.status === 'CLOSED') {
        throw new RemittanceException(
          `${input.providerCode} is unavailable right now`,
          'PROVIDER_UNAVAILABLE',
          503
        )
      }
      const step = amountStepFor(config.decimalsInAmount)
      const remainder = payoutAmount % step
      if (remainder !== 0n) {
        if (source === payout) {
          throw new RemittanceException(
            `${input.providerCode} only pays whole ${payout} amounts`,
            'AMOUNT_STEP'
          )
        }
        payoutAmount -= remainder
        fxMargin += remainder
      }
      if (payoutAmount < config.minAmount || payoutAmount > config.maxAmount) {
        throw new RemittanceException(
          `${input.providerCode} pays between ${config.minAmount} and ${config.maxAmount} (hundredths of ${payout})`,
          'AMOUNT_OUT_OF_RANGE'
        )
      }
    }

    if (payoutAmount <= 0n) {
      throw new RemittanceException('This amount is too small to send', 'AMOUNT_TOO_SMALL')
    }

    // Surfaced now rather than at confirmation, when the sender has already typed their PIN.
    const available = await CashOutHoldService.availableBalance(wallet)
    if (available < input.sendAmount + fee) {
      throw new RemittanceException(
        'Insufficient available balance for this amount and its fee',
        'INSUFFICIENT_FUNDS',
        402
      )
    }

    return RemittanceQuote.create({
      id: IdGenerator.generateId('RQ'),
      senderUserId: user.id,
      sourceWalletId: wallet.id,
      sourceCurrency: source,
      payoutCurrency: payout,
      sendAmount: input.sendAmount,
      fee,
      payoutAmount,
      fxMargin,
      midRate,
      rate,
      payoutMethod: input.payoutMethod,
      payoutProviderCode: input.payoutMethod === 'mobile_money' ? input.providerCode! : null,
      expiresAt: DateTime.now().plus({ minutes: REMITTANCE_QUOTE_TTL_MINUTES }),
      usedAt: null,
    })
  }

  /* --------------------------------- Send --------------------------------- */

  static async send(
    user: User,
    input: {
      quoteId: string
      senderCountry: string
      payoutMethod: RemittancePayoutMethod
      beneficiaryName: string
      beneficiaryPhone: string
      beneficiaryCity?: string
      beneficiaryCode?: string
      purpose?: string
      idempotencyKey: string
      correlationId: string
    },
    /** Needed for a mobile money payout, which is dispatched right after the debit. */
    provider?: RemittanceMobileMoneyProvider
  ): Promise<{ remittance: Remittance; pickupCode: string | null; replayed: boolean }> {
    // Replay of a request that already went through: same result, nothing moves twice.
    const previous = await Remittance.query()
      .where('sender_user_id', user.id)
      .where('idempotency_key', input.idempotencyKey)
      .first()
    if (previous) {
      return { remittance: previous, pickupCode: this.revealCode(previous), replayed: true }
    }

    await this.assertKycApproved(user.id)

    const senderCountry = input.senderCountry.toUpperCase()
    if (senderCountry === PAYOUT_COUNTRY) {
      throw new RemittanceException(
        'Transfers within the DRC use a regular Reemite transfer',
        'DOMESTIC_NOT_SUPPORTED'
      )
    }

    const phone = normalizeDrcPhone(input.beneficiaryPhone)
    if (!phone) {
      throw new RemittanceException(
        "The beneficiary's phone must be a DRC number (+243…)",
        'INVALID_BENEFICIARY_PHONE'
      )
    }

    // Wallet payout: the beneficiary is a Reemite customer named by their code.
    let beneficiaryUser: User | null = null
    if (input.payoutMethod === 'wallet') {
      beneficiaryUser = input.beneficiaryCode
        ? await User.findBy('code', input.beneficiaryCode)
        : null
      if (!beneficiaryUser) {
        throw new RemittanceException(
          'No Reemite account matches this code',
          'BENEFICIARY_NOT_FOUND',
          404
        )
      }
      if (beneficiaryUser.id === user.id) {
        throw new RemittanceException('You cannot send a transfer to yourself', 'SELF_REMITTANCE')
      }
    }

    const senderName = user.fullName?.trim() || user.email || `User ${user.id}`
    const screenedNames = [senderName, input.beneficiaryName]
    if (beneficiaryUser?.fullName) screenedNames.push(beneficiaryUser.fullName)
    const hits = await ScreeningService.screen(screenedNames)

    const outcome = await db.transaction(async (trx) => {
      const quote = await RemittanceQuote.query({ client: trx })
        .where('id', input.quoteId)
        .where('sender_user_id', user.id)
        .forUpdate()
        .first()
      if (!quote) throw new RemittanceException('Quote not found', 'QUOTE_NOT_FOUND', 404)
      if (quote.usedAt)
        throw new RemittanceException('This quote was already used', 'QUOTE_USED', 409)
      if (quote.expiresAt < DateTime.now()) {
        throw new RemittanceException(
          'The rate has expired: request a new quote',
          'QUOTE_EXPIRED',
          410
        )
      }
      this.assertPayoutCurrency(input.payoutMethod, quote.payoutCurrency)
      // A mobile money amount was rounded for one operator: the quote only serves that method.
      if (quote.payoutMethod && quote.payoutMethod !== input.payoutMethod) {
        throw new RemittanceException(
          'This quote was made for another payout method',
          'QUOTE_STALE',
          409
        )
      }

      const wallet = await this.sourceWallet(user.id, quote.sourceCurrency, trx)
      if (wallet.id !== quote.sourceWalletId) {
        throw new RemittanceException(
          'The quoted wallet is no longer available',
          'QUOTE_STALE',
          409
        )
      }
      const total = quote.sendAmount + quote.fee
      if (wallet.balanceCache < total) {
        throw new RemittanceException('Insufficient balance', 'INSUFFICIENT_FUNDS', 402)
      }
      await CashOutHoldService.assertAvailable(wallet, total, trx)
      await LimitService.assertWithinLimits(wallet, total, trx)

      let beneficiaryWallet: Wallet | null = null
      if (beneficiaryUser) {
        beneficiaryWallet = await Wallet.query({ client: trx })
          .withScopes((s) => s.primary())
          .where('user_id', beneficiaryUser.id)
          .where('currency_code', quote.payoutCurrency)
          .where('status', 'active')
          .first()
        if (!beneficiaryWallet) {
          throw new RemittanceException(
            `The beneficiary has no active ${quote.payoutCurrency} wallet`,
            'BENEFICIARY_WALLET_NOT_FOUND',
            404
          )
        }
      }

      const id = IdGenerator.generateId('REM')
      const code = input.payoutMethod === 'cash_pickup' ? generateCode() : null

      const sendTxn = await this.postSend(trx, {
        remittanceId: id,
        userId: user.id,
        walletId: wallet.id,
        quote,
        correlationId: input.correlationId,
      })

      const remittance = new Remittance()
      remittance.id = id
      remittance.senderUserId = user.id
      remittance.sourceWalletId = wallet.id
      remittance.senderCountry = senderCountry
      remittance.senderName = senderName
      remittance.sourceCurrency = quote.sourceCurrency
      remittance.sendAmount = quote.sendAmount
      remittance.fee = quote.fee
      remittance.payoutCurrency = quote.payoutCurrency
      remittance.payoutAmount = quote.payoutAmount
      remittance.fxMargin = quote.fxMargin
      remittance.rate = quote.rate
      remittance.payoutMethod = input.payoutMethod
      remittance.beneficiaryName = input.beneficiaryName.trim()
      remittance.beneficiaryPhone = phone
      remittance.beneficiaryCity = input.beneficiaryCity?.trim() || null
      remittance.beneficiaryUserId = beneficiaryUser?.id ?? null
      remittance.purpose = input.purpose?.trim() || null
      remittance.pickupCodeHash = code ? hashCode(code) : null
      remittance.pickupCodeEncrypted = code ? CryptoService.encrypt(code) : null
      remittance.verificationFailures = 0
      remittance.status = hits.length
        ? 'held'
        : input.payoutMethod === 'wallet'
          ? 'paid'
          : 'awaiting_payout'
      remittance.holdReason = hits.length
        ? `Watchlist match: ${hits.map((h) => `${h.name} ~ ${h.entry} (${h.source})`).join('; ')}`
        : null
      remittance.expiresAt = DateTime.now().plus({ days: REMITTANCE_TTL_DAYS })
      remittance.sendTransactionId = sendTxn.id
      remittance.idempotencyKey = input.idempotencyKey
      remittance.payoutProviderCode = quote.payoutProviderCode
      await remittance.useTransaction(trx).save()

      if (remittance.status === 'paid' && beneficiaryWallet) {
        await this.postWalletPayout(trx, remittance, beneficiaryWallet, input.correlationId)
      }

      quote.usedAt = DateTime.now()
      await quote.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: user.id,
        action: 'remittance.sent',
        resourceType: 'remittance',
        resourceId: remittance.id,
        before: undefined,
        after: {
          status: remittance.status,
          send: `${quote.sendAmount} ${quote.sourceCurrency}`,
          payout: `${quote.payoutAmount} ${quote.payoutCurrency}`,
          method: input.payoutMethod,
          sender_country: senderCountry,
          screening_hits: hits.length,
        },
        correlationId: input.correlationId,
        trx,
      })

      return { remittance, code }
    })

    if (outcome.remittance.status === 'paid' && outcome.remittance.beneficiaryUserId) {
      await InAppNotificationService.notify({
        recipientType: 'user',
        recipientId: outcome.remittance.beneficiaryUserId,
        type: 'remittance.received',
        title: 'Transfert reçu',
        message: `Vous avez reçu un transfert de ${outcome.remittance.senderName}.`,
        data: { remittance_id: outcome.remittance.id },
      })
    }

    // Mobile money leaves after the debit is committed — never before, never inside it.
    if (
      outcome.remittance.payoutMethod === 'mobile_money' &&
      outcome.remittance.status === 'awaiting_payout' &&
      provider
    ) {
      const dispatched = await this.dispatchMobileMoney(
        outcome.remittance.id,
        provider,
        input.correlationId
      )
      return { remittance: dispatched, pickupCode: null, replayed: false }
    }

    return { remittance: outcome.remittance, pickupCode: outcome.code, replayed: false }
  }

  /** The pickup code, for the sender only — null once it can no longer be used. */
  static revealCode(remittance: Remittance): string | null {
    if (!remittance.pickupCodeEncrypted) return null
    if (remittance.status !== 'awaiting_payout' && remittance.status !== 'held') return null
    return CryptoService.decrypt(remittance.pickupCodeEncrypted)
  }

  /* ------------------------------ Agent payout ---------------------------- */

  /**
   * What an agent sees after typing a pickup code: enough to identify the beneficiary, never
   * their full phone number (the agent must obtain it from the beneficiary, which is the second
   * factor at payout).
   */
  static async lookupForAgent(agent: Agent, code: string, correlationId: string) {
    const since = DateTime.now().minus({ hours: 1 }).toJSDate()
    const recentFailures = await AuditLog.query()
      .where('actor_type', 'agent')
      .where('actor_id', agent.id)
      .where('action', 'remittance.lookup_failed')
      .where('created_at', '>=', since)
      .count('* as total')
    if (Number(recentFailures[0].$extras.total) >= AGENT_LOOKUP_FAILURES_PER_HOUR) {
      throw new RemittanceException(
        'Too many unknown codes: try again in an hour',
        'TOO_MANY_LOOKUPS',
        429
      )
    }

    const digits = code.replace(/\D/g, '')
    const remittance =
      digits.length === PICKUP_CODE_LENGTH
        ? await Remittance.findBy('pickup_code_hash', hashCode(digits))
        : null

    if (!remittance) {
      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: agent.id,
        action: 'remittance.lookup_failed',
        resourceType: 'remittance',
        resourceId: 'unknown',
        before: undefined,
        after: undefined,
        correlationId,
      })
      throw new RemittanceException('No transfer matches this code', 'REMITTANCE_NOT_FOUND', 404)
    }

    return remittance
  }

  static async payOut(
    agent: Agent,
    input: {
      remittanceId: string
      code: string
      beneficiaryPhone: string
      idType: string
      idNumber: string
      correlationId: string
    }
  ): Promise<Remittance> {
    const failure = await db.transaction(async (trx) => {
      const remittance = await Remittance.query({ client: trx })
        .where('id', input.remittanceId)
        .forUpdate()
        .first()
      if (!remittance || remittance.pickupCodeHash !== hashCode(input.code.replace(/\D/g, ''))) {
        throw new RemittanceException('No transfer matches this code', 'REMITTANCE_NOT_FOUND', 404)
      }
      this.assertPayable(remittance)
      if (remittance.payoutMethod !== 'cash_pickup') {
        throw new RemittanceException('This transfer is not a cash pickup', 'NOT_CASH_PICKUP', 409)
      }

      // Second factor: the beneficiary's own phone number, obtained from them at the counter.
      if (normalizeDrcPhone(input.beneficiaryPhone) !== remittance.beneficiaryPhone) {
        remittance.verificationFailures += 1
        if (remittance.verificationFailures >= MAX_VERIFICATION_FAILURES) {
          remittance.status = 'held'
          remittance.holdReason = 'Too many wrong beneficiary phone numbers at the counter'
        }
        await remittance.useTransaction(trx).save()
        await AuditLoggerService.record({
          actorType: 'agent',
          actorId: agent.id,
          action: 'remittance.verification_failed',
          resourceType: 'remittance',
          resourceId: remittance.id,
          before: undefined,
          after: { failures: remittance.verificationFailures, status: remittance.status },
          correlationId: input.correlationId,
          trx,
        })
        // Returned, not thrown: the failure count must be committed.
        return remittance.status === 'held' ? 'locked' : 'phone_mismatch'
      }

      // The float in the payout currency, opened empty if the agent never held it: a payout
      // only credits it, so an agent with a USD float can still pay a CDF transfer.
      const floatRow = await AgentFloatService.ensureFloatWallet(
        agent,
        remittance.payoutCurrency,
        trx
      )
      const floatWallet = await Wallet.query({ client: trx })
        .where('id', floatRow.id)
        .forUpdate()
        .firstOrFail()

      await AgentLimitService.assertWithinLimits(
        agent.id,
        new Money(remittance.payoutAmount, remittance.payoutCurrency),
        trx
      )

      const commission = percentOf(
        remittance.payoutAmount,
        await FeeScheduleService.getFeePercent('remittance_agent_commission'),
        false
      )
      const currency = remittance.payoutCurrency
      const payable = await platform(
        'REMITTANCE_PAYABLE',
        'Remittances payable',
        currency,
        trx,
        'liability'
      )
      const floatAccount = await walletAccountId(floatWallet.id, 'agent_wallet', trx)

      const entries: Entry[] = [
        {
          accountId: payable.id,
          direction: 'debit',
          amount: new Money(remittance.payoutAmount, currency),
        },
        {
          accountId: floatAccount,
          direction: 'credit',
          amount: new Money(remittance.payoutAmount + commission, currency),
        },
      ]
      if (commission > 0n) {
        const expense = await platform(
          'REMITTANCE_AGENT_COMMISSION',
          'Remittance agent commissions',
          currency,
          trx,
          'expense'
        )
        entries.push({
          accountId: expense.id,
          direction: 'debit',
          amount: new Money(commission, currency),
        })
      }

      const txn = await LedgerService.postTransaction(
        'remittance_payout',
        entries,
        'agent',
        agent.id,
        {
          correlationId: input.correlationId,
          description: `Remittance ${remittance.id} paid out in cash by agent ${agent.code}`,
          metadata: {
            remittance_id: remittance.id,
            amount: remittance.payoutAmount.toString(),
            currency_code: currency,
            commission: commission.toString(),
          },
          amount: new Money(remittance.payoutAmount, currency),
          paymentMethod: 'cash_agent',
          paymentChannel: agent.code,
          fee: commission,
          trx,
        }
      )

      remittance.status = 'paid'
      remittance.paidAt = DateTime.now()
      remittance.paidByAgentId = agent.id
      remittance.beneficiaryIdType = input.idType
      remittance.beneficiaryIdNumber = input.idNumber.trim()
      remittance.payoutTransactionId = txn.id
      await remittance.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: 'agent',
        actorId: agent.id,
        action: 'remittance.paid',
        resourceType: 'remittance',
        resourceId: remittance.id,
        before: { status: 'awaiting_payout' },
        after: { status: 'paid', id_type: input.idType, commission: commission.toString() },
        correlationId: input.correlationId,
        trx,
      })
      return null
    })

    if (failure === 'locked') {
      throw new RemittanceException(
        'Too many wrong phone numbers: this transfer is now held for review',
        'VERIFICATION_LOCKED',
        423
      )
    }
    if (failure === 'phone_mismatch') {
      throw new RemittanceException(
        "The phone number does not match the beneficiary's",
        'PHONE_MISMATCH'
      )
    }

    const remittance = await Remittance.findOrFail(input.remittanceId)
    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: remittance.senderUserId,
      type: 'remittance.paid',
      title: 'Transfert retiré',
      message: `${remittance.beneficiaryName} a retiré votre transfert ${remittance.id}.`,
      data: { remittance_id: remittance.id },
    })
    return remittance
  }

  static assertPayable(remittance: Remittance) {
    if (remittance.status === 'held') {
      throw new RemittanceException(
        'This transfer is under compliance review and cannot be paid yet',
        'REMITTANCE_HELD',
        409
      )
    }
    if (remittance.status !== 'awaiting_payout') {
      throw new RemittanceException(
        `This transfer is ${remittance.status}`,
        'REMITTANCE_NOT_PAYABLE',
        409
      )
    }
    if (remittance.expiresAt < DateTime.now()) {
      throw new RemittanceException('This transfer has expired', 'REMITTANCE_EXPIRED', 410)
    }
  }

  /* ---------------------------- Refund & review --------------------------- */

  static async cancelBySender(user: User, remittanceId: string, correlationId: string) {
    const remittance = await Remittance.find(remittanceId)
    if (!remittance || remittance.senderUserId !== user.id) {
      throw new RemittanceException('Transfer not found', 'REMITTANCE_NOT_FOUND', 404)
    }
    // Once handed to the operator, the money may already be on the beneficiary's phone.
    if (remittance.payoutProviderReference) {
      throw new RemittanceException(
        'This transfer is already on its way to the mobile money wallet',
        'REMITTANCE_STATE',
        409
      )
    }
    return this.refund(
      remittanceId,
      'cancelled',
      'Cancelled by the sender',
      { type: 'user', id: user.id },
      correlationId
    )
  }

  /** Compliance review: a held transfer becomes payable (or is credited, for a wallet payout). */
  static async release(
    remittanceId: string,
    reviewerId: number,
    correlationId: string,
    provider?: RemittanceMobileMoneyProvider
  ) {
    const remittance = await db.transaction(async (trx) => {
      const row = await Remittance.query({ client: trx })
        .where('id', remittanceId)
        .forUpdate()
        .firstOrFail()
      if (row.status !== 'held') {
        throw new RemittanceException(
          'Only a held transfer can be released',
          'REMITTANCE_STATE',
          409
        )
      }
      row.holdReason = null
      row.verificationFailures = 0

      if (row.payoutMethod === 'wallet' && row.beneficiaryUserId) {
        const beneficiaryWallet = await Wallet.query({ client: trx })
          .withScopes((s) => s.primary())
          .where('user_id', row.beneficiaryUserId)
          .where('currency_code', row.payoutCurrency)
          .where('status', 'active')
          .first()
        if (!beneficiaryWallet) {
          throw new RemittanceException(
            'The beneficiary no longer has an active wallet in this currency: reject to refund',
            'BENEFICIARY_WALLET_NOT_FOUND',
            409
          )
        }
        row.status = 'paid'
        await row.useTransaction(trx).save()
        await this.postWalletPayout(trx, row, beneficiaryWallet, correlationId)
      } else {
        row.status = 'awaiting_payout'
        await row.useTransaction(trx).save()
      }

      await AuditLoggerService.record({
        actorType: 'internal_user',
        actorId: reviewerId,
        action: 'remittance.released',
        resourceType: 'remittance',
        resourceId: row.id,
        before: { status: 'held' },
        after: { status: row.status },
        correlationId,
        trx,
      })
      return row
    })

    if (remittance.payoutMethod === 'mobile_money' && provider) {
      return this.dispatchMobileMoney(remittance.id, provider, correlationId)
    }
    return remittance
  }

  static async reject(
    remittanceId: string,
    reviewerId: number,
    reason: string,
    correlationId: string
  ) {
    return this.refund(
      remittanceId,
      'rejected',
      reason,
      { type: 'internal_user', id: reviewerId },
      correlationId
    )
  }

  /** Refunds every transfer whose pickup window has closed. */
  static async expireStale(): Promise<number> {
    const due = await Remittance.query()
      .whereIn('status', ['awaiting_payout', 'held'])
      .where('expires_at', '<', DateTime.now().toJSDate())
      // Mobile money is not collected by anyone: reconcileMobileMoney() follows it instead.
      .where((q) => q.whereNot('payout_method', 'mobile_money').orWhere('status', 'held'))
      .select('id')
    let expired = 0
    for (const { id } of due) {
      try {
        await this.refund(
          id,
          'expired',
          'Not collected in time',
          { type: 'system', id: 0 },
          `expire-${id}`
        )
        expired++
      } catch (error) {
        // Picked up or cancelled between the scan and the lock: nothing to refund.
        if ((error as RemittanceException).code !== 'REMITTANCE_STATE') throw error
      }
    }
    return expired
  }

  private static async refund(
    remittanceId: string,
    finalStatus: Extract<RemittanceStatus, 'cancelled' | 'expired' | 'rejected' | 'failed'>,
    reason: string,
    actor: { type: 'user' | 'internal_user' | 'system'; id: number },
    correlationId: string,
    allowedFrom: RemittanceStatus[] = ['awaiting_payout', 'held']
  ): Promise<Remittance> {
    const remittance = await db.transaction(async (trx) => {
      const row = await Remittance.query({ client: trx })
        .where('id', remittanceId)
        .forUpdate()
        .first()
      if (!row) throw new RemittanceException('Transfer not found', 'REMITTANCE_NOT_FOUND', 404)
      if (!allowedFrom.includes(row.status)) {
        throw new RemittanceException(
          row.status === 'paid'
            ? 'This transfer has already been paid out'
            : `This transfer is ${row.status}`,
          'REMITTANCE_STATE',
          409
        )
      }

      const source = row.sourceCurrency
      const payout = row.payoutCurrency
      const senderAccount = await walletAccountId(row.sourceWalletId, 'user_wallet', trx)
      const payable = await platform(
        'REMITTANCE_PAYABLE',
        'Remittances payable',
        payout,
        trx,
        'liability'
      )

      const entries: Entry[] = [
        { accountId: payable.id, direction: 'debit', amount: new Money(row.payoutAmount, payout) },
        {
          accountId: senderAccount,
          direction: 'credit',
          amount: new Money(row.sendAmount + row.fee, source),
        },
      ]
      if (row.fee > 0n) {
        const fees = await platform('REMITTANCE_FEES', 'Remittance fees', source, trx, 'revenue')
        entries.push({ accountId: fees.id, direction: 'debit', amount: new Money(row.fee, source) })
      }
      if (source === payout) {
        // payable (payout) + fees (fee) = sender (send + fee): balanced, sendAmount === payoutAmount.
      } else {
        const sourcePosition = await platform('FX_POSITION', 'FX position', source, trx, 'asset')
        const payoutPosition = await platform('FX_POSITION', 'FX position', payout, trx, 'asset')
        entries.push(
          {
            accountId: sourcePosition.id,
            direction: 'debit',
            amount: new Money(row.sendAmount, source),
          },
          {
            accountId: payoutPosition.id,
            direction: 'credit',
            amount: new Money(row.payoutAmount + row.fxMargin, payout),
          }
        )
        if (row.fxMargin > 0n) {
          const fxRevenue = await platform('FX_REVENUE', 'FX revenue', payout, trx, 'revenue')
          entries.push({
            accountId: fxRevenue.id,
            direction: 'debit',
            amount: new Money(row.fxMargin, payout),
          })
        }
      }

      const txn = await LedgerService.postTransaction('remittance_refund', entries, 'system', 0, {
        correlationId,
        description: `Remittance ${row.id} refunded (${finalStatus})`,
        metadata: {
          remittance_id: row.id,
          amount: (row.sendAmount + row.fee).toString(),
          currency_code: source,
          reason,
        },
        amount: new Money(row.sendAmount + row.fee, source),
        paymentMethod: 'wallet',
        relatedTransactionId: row.sendTransactionId ?? undefined,
        trx,
      })

      const previous = row.status
      row.status = finalStatus
      row.failureReason = reason
      row.refundTransactionId = txn.id
      await row.useTransaction(trx).save()

      await AuditLoggerService.record({
        actorType: actor.type,
        actorId: actor.id,
        action: `remittance.${finalStatus}`,
        resourceType: 'remittance',
        resourceId: row.id,
        before: { status: previous },
        after: { status: finalStatus, reason },
        correlationId,
        trx,
      })
      return row
    })

    const label = {
      cancelled: 'annulé',
      expired: 'expiré',
      rejected: 'refusé',
      failed: 'échoué',
    }[finalStatus]
    await InAppNotificationService.notify({
      recipientType: 'user',
      recipientId: remittance.senderUserId,
      type: `remittance.${finalStatus}`,
      title: `Transfert ${label}`,
      message: `Votre transfert ${remittance.id} a été ${label} et intégralement remboursé.`,
      data: { remittance_id: remittance.id },
    })
    return remittance
  }

  /* ---------------------------- Mobile money ------------------------------ */

  /**
   * Hands a mobile money payout to the operator.
   *
   * The PawaPay reference is committed BEFORE the call: if the process dies mid-call, the
   * reconciliation sweep still knows what to ask PawaPay about. Accepted → the owed amount moves
   * from REMITTANCE_PAYABLE to MOBILE_MONEY_CLEARING and the transfer is `processing` until the
   * webhook confirms. Rejected outright → the sender is refunded in full (`failed`). A network
   * error leaves the transfer as is, for reconcileMobileMoney() to settle.
   */
  static async dispatchMobileMoney(
    remittanceId: string,
    provider: RemittanceMobileMoneyProvider,
    correlationId: string
  ): Promise<Remittance> {
    const prepared = await db.transaction(async (trx) => {
      const row = await Remittance.query({ client: trx })
        .where('id', remittanceId)
        .forUpdate()
        .firstOrFail()
      if (row.payoutMethod !== 'mobile_money' || row.status !== 'awaiting_payout') return null
      if (row.payoutProviderReference) return null
      row.payoutProviderReference = randomUUID()
      row.dispatchedAt = DateTime.now()
      await row.useTransaction(trx).save()
      return row
    })
    if (!prepared) return Remittance.findOrFail(remittanceId)

    let outcome: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE_IGNORED'
    let failure: string | null = null
    try {
      const result = await provider.initiatePayout({
        providerReferenceId: prepared.payoutProviderReference!,
        amount: prepared.payoutAmount.toString(),
        currencyCode: prepared.payoutCurrency,
        phoneNumber: prepared.beneficiaryPhone,
        providerCode: prepared.payoutProviderCode!,
        customerMessage: 'Reemite',
      })
      outcome = result.outcome
      failure = result.failureReason
        ? `${result.failureReason.code}: ${result.failureReason.message}`
        : null
    } catch {
      // Unknown outcome: the sweep asks PawaPay about this reference later.
      return Remittance.findOrFail(remittanceId)
    }

    if (outcome === 'REJECTED') {
      return this.refund(
        remittanceId,
        'failed',
        failure ?? 'Refused by the mobile money operator',
        { type: 'system', id: 0 },
        correlationId
      )
    }

    return db.transaction(async (trx) => {
      const row = await Remittance.query({ client: trx })
        .where('id', remittanceId)
        .forUpdate()
        .firstOrFail()
      if (row.status === 'awaiting_payout')
        await this.postMobileMoneyClearing(trx, row, correlationId)
      return row
    })
  }

  /**
   * Final word from PawaPay (webhook or reconciliation). Idempotent: a transfer already paid,
   * failed or refunded is left alone. Returns null when the reference is not a remittance, so the
   * webhook can fall back to ordinary wallet payouts.
   */
  static async confirmMobileMoneyPayout(
    providerReferenceId: string,
    finalStatus: 'COMPLETED' | 'FAILED',
    options: { providerTransactionId?: string; failureReason?: { code: string; message: string } },
    correlationId: string
  ): Promise<Remittance | null> {
    const existing = await Remittance.findBy('payout_provider_reference', providerReferenceId)
    if (!existing) return null

    const result = await db.transaction(async (trx) => {
      const row = await Remittance.query({ client: trx })
        .where('id', existing.id)
        .forUpdate()
        .firstOrFail()
      if (row.status !== 'awaiting_payout' && row.status !== 'processing')
        return { row, refund: false }

      // Accepted but the clearing post never committed (crash between call and post): heal first.
      if (row.status === 'awaiting_payout')
        await this.postMobileMoneyClearing(trx, row, correlationId)

      if (finalStatus === 'COMPLETED') {
        row.status = 'paid'
        row.paidAt = DateTime.now()
        row.payoutProviderTransactionId = options.providerTransactionId ?? null
        await row.useTransaction(trx).save()
        await AuditLoggerService.record({
          actorType: 'system',
          actorId: 0,
          action: 'remittance.paid',
          resourceType: 'remittance',
          resourceId: row.id,
          before: { status: 'processing' },
          after: { status: 'paid', channel: 'mobile_money' },
          correlationId,
          trx,
        })
        return { row, refund: false }
      }

      // FAILED: the money never left — bring it back from clearing to payable, then refund.
      const currency = row.payoutCurrency
      const payable = await platform(
        'REMITTANCE_PAYABLE',
        'Remittances payable',
        currency,
        trx,
        'liability'
      )
      const clearing = await platform(
        'MOBILE_MONEY_CLEARING',
        'Mobile money clearing',
        currency,
        trx,
        'asset'
      )
      // Exact mirror of postMobileMoneyClearing(), same convention as wallet payouts.
      await LedgerService.postTransaction(
        'remittance_payout_reversal',
        [
          {
            accountId: clearing.id,
            direction: 'debit',
            amount: new Money(row.payoutAmount, currency),
          },
          {
            accountId: payable.id,
            direction: 'credit',
            amount: new Money(row.payoutAmount, currency),
          },
        ],
        'system',
        0,
        {
          correlationId,
          description: `Remittance ${row.id} mobile money payout failed`,
          metadata: {
            remittance_id: row.id,
            amount: row.payoutAmount.toString(),
            currency_code: currency,
            reason: options.failureReason?.code ?? 'FAILED',
          },
          amount: new Money(row.payoutAmount, currency),
          paymentMethod: 'mobile_money',
          relatedTransactionId: row.payoutTransactionId ?? undefined,
          trx,
        }
      )
      // Back to "owed": refund() below reverses the send from this state.
      row.status = 'processing'
      await row.useTransaction(trx).save()
      return { row, refund: true }
    })

    if (!result.refund) return result.row
    return this.refund(
      existing.id,
      'failed',
      options.failureReason
        ? `${options.failureReason.code}: ${options.failureReason.message}`
        : 'The mobile money payout failed',
      { type: 'system', id: 0 },
      correlationId,
      ['processing', 'awaiting_payout']
    )
  }

  /**
   * Settles mobile money payouts left pending: dispatches the ones that never reached PawaPay and
   * asks PawaPay about the ones whose webhook never came. Run with the mobile money sweep.
   */
  static async reconcileMobileMoney(
    provider: RemittanceMobileMoneyProvider,
    { staleAfterMinutes = 10, giveUpAfterMinutes = 60 } = {}
  ): Promise<{ dispatched: number; settled: number; stillPending: number }> {
    const summary = { dispatched: 0, settled: 0, stillPending: 0 }
    const staleBefore = DateTime.now().minus({ minutes: staleAfterMinutes }).toJSDate()
    const giveUpBefore = DateTime.now().minus({ minutes: giveUpAfterMinutes })

    const pending = await Remittance.query()
      .where('payout_method', 'mobile_money')
      .whereIn('status', ['awaiting_payout', 'processing'])
      .where('updated_at', '<', staleBefore)

    for (const row of pending) {
      const correlationId = `reconcile-${row.id}`
      if (!row.payoutProviderReference) {
        await this.dispatchMobileMoney(row.id, provider, correlationId)
        summary.dispatched++
        continue
      }
      try {
        const status = await provider.checkPayoutStatus(row.payoutProviderReference)
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          await this.confirmMobileMoneyPayout(
            row.payoutProviderReference,
            status.status,
            {
              providerTransactionId: status.providerTransactionId,
              failureReason: status.failureReason,
            },
            correlationId
          )
          summary.settled++
        } else {
          summary.stillPending++
        }
      } catch {
        // PawaPay has no record: the dispatch never landed. After a grace period it is safe to
        // refund — nothing can arrive on the beneficiary's phone for an unknown reference.
        if (row.dispatchedAt && row.dispatchedAt < giveUpBefore) {
          await this.confirmMobileMoneyPayout(
            row.payoutProviderReference,
            'FAILED',
            {
              failureReason: {
                code: 'NOT_FOUND_AT_PROVIDER',
                message: 'Payout never reached the operator',
              },
            },
            correlationId
          )
          summary.settled++
        } else {
          summary.stillPending++
        }
      }
    }
    return summary
  }

  private static async postMobileMoneyClearing(
    trx: TransactionClientContract,
    row: Remittance,
    correlationId: string
  ) {
    const currency = row.payoutCurrency
    const payable = await platform(
      'REMITTANCE_PAYABLE',
      'Remittances payable',
      currency,
      trx,
      'liability'
    )
    const clearing = await platform(
      'MOBILE_MONEY_CLEARING',
      'Mobile money clearing',
      currency,
      trx,
      'asset'
    )
    const txn = await LedgerService.postTransaction(
      'remittance_payout',
      [
        {
          accountId: payable.id,
          direction: 'debit',
          amount: new Money(row.payoutAmount, currency),
        },
        {
          accountId: clearing.id,
          direction: 'credit',
          amount: new Money(row.payoutAmount, currency),
        },
      ],
      'system',
      0,
      {
        correlationId,
        description: `Remittance ${row.id} sent to ${row.payoutProviderCode}`,
        metadata: {
          remittance_id: row.id,
          amount: row.payoutAmount.toString(),
          currency_code: currency,
          provider_code: row.payoutProviderCode,
        },
        amount: new Money(row.payoutAmount, currency),
        paymentMethod: 'mobile_money',
        paymentChannel: row.payoutProviderCode ?? undefined,
        counterpartyPhone: row.beneficiaryPhone,
        trx,
      }
    )
    row.status = 'processing'
    row.payoutTransactionId = txn.id
    await row.useTransaction(trx).save()
  }

  /* -------------------------------- Ledger -------------------------------- */

  private static async postSend(
    trx: TransactionClientContract,
    input: {
      remittanceId: string
      userId: number
      walletId: number
      quote: RemittanceQuote
      correlationId: string
    }
  ) {
    const { quote } = input
    const source = quote.sourceCurrency
    const payout = quote.payoutCurrency
    const senderAccount = await walletAccountId(input.walletId, 'user_wallet', trx)
    const payable = await platform(
      'REMITTANCE_PAYABLE',
      'Remittances payable',
      payout,
      trx,
      'liability'
    )

    const entries: Entry[] = [
      {
        accountId: senderAccount,
        direction: 'debit',
        amount: new Money(quote.sendAmount + quote.fee, source),
      },
      { accountId: payable.id, direction: 'credit', amount: new Money(quote.payoutAmount, payout) },
    ]
    if (quote.fee > 0n) {
      const fees = await platform('REMITTANCE_FEES', 'Remittance fees', source, trx, 'revenue')
      entries.push({
        accountId: fees.id,
        direction: 'credit',
        amount: new Money(quote.fee, source),
      })
    }
    if (source !== payout) {
      const sourcePosition = await platform('FX_POSITION', 'FX position', source, trx, 'asset')
      const payoutPosition = await platform('FX_POSITION', 'FX position', payout, trx, 'asset')
      entries.push(
        {
          accountId: sourcePosition.id,
          direction: 'credit',
          amount: new Money(quote.sendAmount, source),
        },
        {
          accountId: payoutPosition.id,
          direction: 'debit',
          amount: new Money(quote.payoutAmount + quote.fxMargin, payout),
        }
      )
      if (quote.fxMargin > 0n) {
        const fxRevenue = await platform('FX_REVENUE', 'FX revenue', payout, trx, 'revenue')
        entries.push({
          accountId: fxRevenue.id,
          direction: 'credit',
          amount: new Money(quote.fxMargin, payout),
        })
      }
    }

    return LedgerService.postTransaction('remittance_send', entries, 'user', input.userId, {
      correlationId: input.correlationId,
      description: `International transfer ${input.remittanceId} to the DRC`,
      metadata: {
        remittance_id: input.remittanceId,
        amount: (quote.sendAmount + quote.fee).toString(),
        currency_code: source,
        payout_amount: quote.payoutAmount.toString(),
        payout_currency: payout,
        fee: quote.fee.toString(),
        rate: quote.rate,
      },
      amount: new Money(quote.sendAmount + quote.fee, source),
      paymentMethod: 'wallet',
      fee: quote.fee,
      trx,
    })
  }

  private static async postWalletPayout(
    trx: TransactionClientContract,
    remittance: Remittance,
    beneficiaryWallet: Wallet,
    correlationId: string
  ) {
    const currency = remittance.payoutCurrency
    const payable = await platform(
      'REMITTANCE_PAYABLE',
      'Remittances payable',
      currency,
      trx,
      'liability'
    )
    const beneficiaryAccount = await walletAccountId(beneficiaryWallet.id, 'user_wallet', trx)

    const txn = await LedgerService.postTransaction(
      'remittance_payout',
      [
        {
          accountId: payable.id,
          direction: 'debit',
          amount: new Money(remittance.payoutAmount, currency),
        },
        {
          accountId: beneficiaryAccount,
          direction: 'credit',
          amount: new Money(remittance.payoutAmount, currency),
        },
      ],
      'system',
      0,
      {
        correlationId,
        description: `Remittance ${remittance.id} credited to wallet`,
        metadata: {
          remittance_id: remittance.id,
          amount: remittance.payoutAmount.toString(),
          currency_code: currency,
          sender_name: remittance.senderName,
        },
        amount: new Money(remittance.payoutAmount, currency),
        paymentMethod: 'wallet',
        trx,
      }
    )

    remittance.paidAt = DateTime.now()
    remittance.payoutTransactionId = txn.id
    await remittance.useTransaction(trx).save()
  }
}
