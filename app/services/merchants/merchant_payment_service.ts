import { randomInt } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Business from '#models/business'
import LedgerAccount from '#models/ledger_account'
import OutboxEvent from '#models/outbox_event'
import Wallet from '#models/wallet'
import type User from '#models/user'
import { Money } from '#services/money/money'
import { LedgerService } from '#services/ledger/ledger_service'
import { LimitService } from '#services/ledger/limit_service'
import { FeeScheduleService } from '#services/ledger/fee_schedule_service'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { WebhookService } from '#services/webhooks/webhook_service'

export class MerchantPaymentException extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422
  ) {
    super(message)
    this.name = 'MerchantPaymentException'
  }
}

/** `percent` % of `amount`, rounded half up to the smallest unit. */
function feeOn(amount: bigint, percent: number): bigint {
  const bps = BigInt(Math.round(percent * 100))
  return (amount * bps + 5000n) / 10000n
}

export type MerchantPaymentResult = {
  transactionId: string
  transactionUuid: string
  businessId: number
  merchantName: string
  amount: bigint
  currencyCode: string
  /** Kept by the platform out of the merchant's share; the customer pays `amount` only. */
  fee: bigint
  createdAt: unknown
}

/**
 * A customer pays a merchant — a business account — from the app, by its six-digit payment code
 * or the QR that carries it.
 *
 * Free for the customer: their wallet is debited exactly the amount. The merchant receives the
 * amount minus the `merchant_payment` fee (1 %, fee_schedules), which goes to MERCHANT_FEES.
 * Paid in the merchant's own currency: the customer needs a wallet in a currency the merchant
 * holds — no conversion yet.
 *
 * Only an active merchant (approved, KYB done) can be paid: a customer must never pay a business
 * that has not been verified while believing it has.
 */
export class MerchantPaymentService {
  /** A fresh, unused six-digit payment code. */
  static async generatePaymentCode(trx?: TransactionClientContract): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = randomInt(100000, 1000000).toString()
      const taken = await Business.query({ client: trx }).where('payment_code', code).first()
      if (!taken) return code
    }
    throw new Error('Unable to generate a unique merchant payment code')
  }

  /** The merchant behind a payment code, if it can be paid right now. */
  static async findPayable(code: string): Promise<Business | null> {
    const business = await Business.query().where('payment_code', code).first()
    if (!business || business.kind !== 'merchant' || business.status !== 'active') return null
    return business
  }

  /** Currencies this merchant can be paid in: those it holds an active wallet for. */
  static async acceptedCurrencies(business: Business): Promise<string[]> {
    const wallets = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('business_id', business.id)
      .where('status', 'active')
      .select('currency_code')
    return [...new Set(wallets.map((w) => w.currencyCode))].sort()
  }

  static async pay(request: {
    user: User
    merchantCode: string
    amount: Money
    correlationId: string
    idempotencyKey?: string
    /** Free text the customer adds — an order or table number. */
    note?: string
  }): Promise<MerchantPaymentResult> {
    const merchant = await this.findPayable(request.merchantCode)
    if (!merchant) {
      throw new MerchantPaymentException(
        'No merchant can be paid with this code',
        'MERCHANT_NOT_FOUND',
        404
      )
    }

    const currencyCode = request.amount.currencyCode
    const amount = request.amount.amount
    const fee = feeOn(amount, await FeeScheduleService.getFeePercent('merchant_payment'))

    return db.transaction(async (trx) => {
      const customerWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('user_id', request.user.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()
      if (!customerWallet) {
        throw new MerchantPaymentException(
          `You have no active ${currencyCode} wallet`,
          'SOURCE_WALLET_NOT_FOUND',
          404
        )
      }

      const merchantWallet = await Wallet.query({ client: trx })
        .withScopes((s) => s.primary())
        .where('business_id', merchant.id)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()
      if (!merchantWallet) {
        throw new MerchantPaymentException(
          `This merchant does not accept ${currencyCode}`,
          'MERCHANT_CURRENCY_UNSUPPORTED'
        )
      }

      // Both rows locked in ascending id order, like every other two-wallet movement, so this
      // cannot deadlock with a transfer touching the same wallets.
      const locked = await db
        .query()
        .from('wallets')
        .whereIn(
          'id',
          [customerWallet.id, merchantWallet.id].sort((a, b) => a - b)
        )
        .orderBy('id', 'asc')
        .forUpdate()
        .useTransaction(trx)
      const customerRow = locked.find((w) => w.id === customerWallet.id)

      if (BigInt(customerRow.balance_cache) < amount) {
        throw new MerchantPaymentException('Insufficient balance', 'INSUFFICIENT_FUNDS', 402)
      }
      // Money reserved for a cash withdrawal is still in the balance but no longer spendable.
      await CashOutHoldService.assertAvailable(customerRow, amount, trx)
      if (customerRow.per_transaction_limit && amount > BigInt(customerRow.per_transaction_limit)) {
        throw new MerchantPaymentException(
          'This amount is above your per-payment limit',
          'LIMIT_EXCEEDED'
        )
      }
      await LimitService.assertWithinLimits(
        {
          id: customerRow.id,
          ledgerAccountId: customerRow.ledger_account_id,
          dailyLimit: customerRow.daily_limit,
          monthlyLimit: customerRow.monthly_limit,
        },
        amount,
        trx
      )

      const accountOf = async (walletId: number, ownerType: string) => {
        const account = await LedgerAccount.query({ client: trx })
          .where('owner_id', walletId)
          .where('owner_type', ownerType)
          .first()
        if (!account) throw new Error(`Ledger account not found for wallet ${walletId}`)
        return account.id
      }
      const customerAccount = await accountOf(customerWallet.id, 'user_wallet')
      const merchantAccount = await accountOf(merchantWallet.id, 'business_wallet')

      const entries: Array<{ accountId: number; direction: 'debit' | 'credit'; amount: Money }> = [
        { accountId: customerAccount, direction: 'debit', amount: request.amount },
        {
          accountId: merchantAccount,
          direction: 'credit',
          amount: new Money(amount - fee, currencyCode),
        },
      ]
      if (fee > 0n) {
        const feesAccount = await LedgerService.getOrCreatePlatformAccount(
          `MERCHANT_FEES.${currencyCode}`,
          `Merchant payment fees (${currencyCode})`,
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

      const note = request.note?.trim() || null
      const txn = await LedgerService.postTransaction(
        'merchant_payment',
        entries,
        'user',
        request.user.id,
        {
          idempotencyKey: request.idempotencyKey,
          correlationId: request.correlationId,
          description: `Payment to ${merchant.name}`,
          metadata: {
            business_id: merchant.id,
            merchant_name: merchant.name,
            merchant_code: merchant.paymentCode,
            customer_wallet_id: customerWallet.id,
            merchant_wallet_id: merchantWallet.id,
            net_to_merchant: (amount - fee).toString(),
            note,
          },
          amount: request.amount,
          fee,
          paymentMethod: 'wallet',
          paymentChannel: merchant.paymentCode ?? undefined,
          trx,
        }
      )

      // Notifications (customer receipt, merchant's dashboard) leave through the outbox, after
      // commit; the merchant's webhook is queued here, in the same transaction.
      const event = new OutboxEvent()
      event.aggregateType = 'ledger_transaction'
      event.aggregateId = txn.id
      event.eventType = 'merchant_payment.completed'
      event.payload = { transaction_id: txn.id, correlation_id: request.correlationId }
      event.status = 'pending'
      await event.useTransaction(trx).save()

      await this.queueWebhook(
        merchant.id,
        txn.id,
        {
          transaction_id: txn.id,
          uuid: txn.uuid,
          type: 'merchant_payment',
          status: txn.status,
          amount: amount.toString(),
          fee: fee.toString(),
          net_amount: (amount - fee).toString(),
          currency_code: currencyCode,
          customer: { name: request.user.fullName, code: request.user.code },
          note,
          created_at: txn.createdAt,
        },
        trx
      )

      await AuditLoggerService.record({
        actorType: 'user',
        actorId: request.user.id,
        action: 'transaction.merchant_payment.completed',
        resourceType: 'ledger_transaction',
        resourceId: txn.id,
        before: undefined,
        after: {
          business_id: merchant.id,
          amount: amount.toString(),
          fee: fee.toString(),
          currency_code: currencyCode,
        },
        correlationId: request.correlationId,
        trx,
      })

      return {
        transactionId: txn.id,
        transactionUuid: txn.uuid,
        businessId: merchant.id,
        merchantName: merchant.name,
        amount,
        currencyCode,
        fee,
        createdAt: txn.createdAt,
      }
    })
  }

  /**
   * Queues `merchant_payment.completed` for the merchant's active webhook subscriptions (sent by
   * the webhook delivery job). The payment was started by the customer, so notifyBusinessWebhook
   * — which only fires for business-initiated transactions — does not apply. Never throws: a
   * webhook wiring problem must not undo a payment.
   */
  private static async queueWebhook(
    businessId: number,
    transactionId: string,
    payload: Record<string, unknown>,
    trx: TransactionClientContract
  ) {
    try {
      const subscriptions = await WebhookService.findActiveSubscriptions(
        'business',
        businessId,
        'merchant_payment.completed'
      )
      for (const subscription of subscriptions) {
        await db
          .insertQuery()
          .table('webhook_deliveries')
          .useTransaction(trx)
          .insert({
            subscription_id: subscription.id,
            event_type: 'merchant_payment.completed',
            payload: JSON.stringify(payload),
            status: 'pending',
            retry_count: 0,
            next_retry_at: new Date(),
            created_at: new Date(),
          })
      }
    } catch (error) {
      console.error('Merchant payment webhook not queued', { transactionId, error })
    }
  }
}
