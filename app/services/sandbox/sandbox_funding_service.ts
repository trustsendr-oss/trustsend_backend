import db from '@adonisjs/lucid/services/db'
import Wallet from '#models/wallet'
import type LedgerTransaction from '#models/ledger_transaction'
import { Money } from '#services/money/money'
import { CurrencyService } from '#services/money/currency_service'
import { LedgerService } from '#services/ledger/ledger_service'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { SandboxMode } from '#services/sandbox/sandbox_mode'

/**
 * Per-request ceiling, in the currency's smallest unit. Not a security limit — sandbox money is
 * worthless — just keeps balances far from bigint overflow and from numbers no test needs.
 */
export const MAX_SANDBOX_FUNDING_AMOUNT = 10_000_000_000n

export class SandboxDisabledException extends Error {
  constructor() {
    super('This endpoint is only available in the sandbox')
    this.name = 'SandboxDisabledException'
  }
}

export class SandboxWalletNotFoundException extends Error {
  constructor(readonly currencyCode: string) {
    super(`No active ${currencyCode} wallet — create one with POST /business/wallet first`)
    this.name = 'SandboxWalletNotFoundException'
  }
}

export class SandboxFundingAmountTooLargeException extends Error {
  constructor() {
    super(`Amount cannot exceed ${MAX_SANDBOX_FUNDING_AMOUNT} (smallest unit) per request`)
    this.name = 'SandboxFundingAmountTooLargeException'
  }
}

/**
 * Credits test money to a sandbox business wallet, so an integrator can exercise payouts, swaps
 * and card top-ups without first completing a mobile money deposit.
 *
 * Goes through the ledger like any other movement — the balance stays reconcilable and the
 * credit shows up in the transaction history — as one balanced transaction:
 *   SANDBOX_FUNDING.<currency>   debit    amount   (platform equity, allowed to go negative)
 *   business wallet              credit   amount
 */
export class SandboxFundingService {
  static async fund(
    businessId: number,
    input: { currencyCode: string; amount: bigint; idempotencyKey: string; correlationId: string }
  ): Promise<{ transaction: LedgerTransaction; wallet: Wallet }> {
    // The route is already behind sandbox_only_middleware.ts; checked again here because this is
    // the one place that creates money from nothing, whoever ends up calling it.
    if (!SandboxMode.isEnabled()) throw new SandboxDisabledException()
    if (input.amount > MAX_SANDBOX_FUNDING_AMOUNT) throw new SandboxFundingAmountTooLargeException()

    const currencyCode = CurrencyService.normalize(input.currencyCode)
    await CurrencyService.requireActive(currencyCode)

    return db.transaction(async (trx) => {
      const wallet = await Wallet.query({ client: trx })
        .where('business_id', businessId)
        .where('currency_code', currencyCode)
        .where('status', 'active')
        .first()
      if (!wallet) throw new SandboxWalletNotFoundException(currencyCode)

      const source = await LedgerService.getOrCreatePlatformAccount(
        `SANDBOX_FUNDING.${currencyCode}`,
        `Sandbox test funds (${currencyCode})`,
        currencyCode,
        trx,
        'equity'
      )
      const amount = new Money(input.amount, currencyCode)

      const transaction = await LedgerService.postTransaction(
        'sandbox_funding',
        [
          { accountId: source.id, direction: 'debit', amount },
          { accountId: wallet.ledgerAccountId, direction: 'credit', amount },
        ],
        'business',
        businessId,
        {
          idempotencyKey: `sandbox_funding:business:${businessId}:${input.idempotencyKey}`,
          correlationId: input.correlationId,
          description: `Sandbox test funds (${currencyCode})`,
          // amount/currency_code: read by clients that list transactions, same as fx_swap
          metadata: {
            amount: input.amount.toString(),
            currency_code: currencyCode,
            wallet_id: wallet.id,
          },
          amount,
          paymentMethod: 'sandbox',
          trx,
        }
      )

      await AuditLoggerService.record({
        actorType: 'business',
        actorId: businessId,
        action: 'transaction.sandbox_funding.completed',
        resourceType: 'ledger_transaction',
        resourceId: transaction.id,
        before: undefined,
        after: {
          wallet_id: wallet.id,
          amount: input.amount.toString(),
          currency_code: currencyCode,
        },
        correlationId: input.correlationId,
        trx,
      })

      // postTransaction updated the balance on its own locked copy of the row
      const funded = await Wallet.query({ client: trx }).where('id', wallet.id).firstOrFail()
      return { transaction, wallet: funded }
    })
  }
}
