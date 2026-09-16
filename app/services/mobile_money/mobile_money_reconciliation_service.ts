import { DateTime } from 'luxon'
import LedgerTransaction from '#models/ledger_transaction'
import { MobileMoneyDepositService } from '#services/mobile_money/mobile_money_deposit_service'
import { MobileMoneyPayoutService } from '#services/mobile_money/mobile_money_payout_service'
import type { MobileMoneyProvider } from '#services/mobile_money/provider'
import type { PawaPayProvider } from '#services/mobile_money/pawapay_provider'
import { LedgerService } from '#services/ledger/ledger_service'
import mobileMoneyConfig from '#config/mobile_money'

export interface ReconciliationResult {
  checked: number
  healed: number
  markedFailed: number
  stillPending: number
}

export interface WalletBalanceDrift {
  country: string
  currency: string
  /** what our MOBILE_MONEY_CLEARING.<currency> ledger account believes we hold at PawaPay */
  ourClearingBalance: string
  /** what PawaPay's /v2/wallet-balances actually reports for this currency right now */
  pawapayActualBalance: string
  /** pawapayActualBalance - ourClearingBalance — positive means PawaPay holds MORE than expected */
  difference: string
}

/**
 * Closes the "double-write gap" inherent to any async payment integration: the moment between
 * "provider accepted the request" and "our own DB commit confirming it" is never atomic. This
 * sweep polls PawaPay directly for any transaction stuck without a terminal local status and
 * self-heals via the same confirmFromCallback() path a real webhook would use — so a missed or
 * lost callback doesn't leave money silently unaccounted for.
 *
 * Safe to run concurrently / repeatedly: confirmFromCallback() is itself idempotent (no-ops on
 * anything already `completed`/`failed`).
 */
export class MobileMoneyReconciliationService {
  static async sweep(provider: MobileMoneyProvider): Promise<ReconciliationResult> {
    const staleBefore = DateTime.now()
      .minus({ minutes: mobileMoneyConfig.reconciliation.staleAfterMinutes })
      .toJSDate()
    const giveUpBefore = DateTime.now()
      .minus({ minutes: mobileMoneyConfig.reconciliation.giveUpAfterMinutes })
      .toJSDate()

    const stuck = await LedgerTransaction.query()
      .where('provider', provider.name)
      .whereIn('type', ['mobile_money_deposit', 'mobile_money_payout'])
      .whereIn('status', ['initiated', 'pending', 'processing'])
      .where('created_at', '<', staleBefore)

    const result: ReconciliationResult = { checked: 0, healed: 0, markedFailed: 0, stillPending: 0 }

    for (const txn of stuck) {
      result.checked++
      const isDeposit = txn.type === 'mobile_money_deposit'
      const referenceId = txn.providerReferenceId

      if (!referenceId) {
        // Should never happen (set at creation), but don't let a bad row loop forever.
        continue
      }

      try {
        const status = isDeposit
          ? await provider.checkDepositStatus(referenceId)
          : await provider.checkPayoutStatus(referenceId)

        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          if (isDeposit) {
            await MobileMoneyDepositService.confirmFromCallback(
              'pawapay',
              referenceId,
              status.status,
              {
                providerTransactionId: status.providerTransactionId,
                failureReason: status.failureReason,
              }
            )
          } else {
            await MobileMoneyPayoutService.confirmFromCallback(
              'pawapay',
              referenceId,
              status.status,
              {
                providerTransactionId: status.providerTransactionId,
                failureReason: status.failureReason,
              }
            )
          }
          result.healed++
        } else {
          result.stillPending++
        }
      } catch {
        // Not found at the provider (the initial call may never have landed) — only give up
        // after a generous grace period, to avoid racing a request that's simply slow.
        if (txn.createdAt.toJSDate() < giveUpBefore) {
          const failureReason = {
            code: 'RECONCILIATION_TIMEOUT',
            message: 'No record found at provider after grace period',
          }
          if (isDeposit) {
            await MobileMoneyDepositService.confirmFromCallback('pawapay', referenceId, 'FAILED', {
              failureReason,
            })
          } else {
            await MobileMoneyPayoutService.confirmFromCallback('pawapay', referenceId, 'FAILED', {
              failureReason,
            })
          }
          result.markedFailed++
        } else {
          result.stillPending++
        }
      }
    }

    return result
  }

  /**
   * Compares our internally-tracked MOBILE_MONEY_CLEARING.<currency> ledger position against
   * PawaPay's actual /v2/wallet-balances for the same currency.
   *
   * Why this exists: PawaPay's deposit/payout APIs never return a fee or net-settled amount —
   * only the gross amount requested (see PawaPayProvider.getWalletBalances doc comment). Our
   * ledger therefore assumes the full gross amount moves in/out of PawaPay's wallet; if PawaPay
   * actually deducts a real fee on their side, that assumption silently drifts from reality with
   * no callback ever telling us so. This is the only way to detect that drift.
   *
   * Important caveat: a non-zero difference is NOT proof of an undocumented fee by itself — it
   * also captures anything else this codebase doesn't ledger, most notably manual wallet
   * top-ups (see docs/dashboard/topping_up). Treat a drift as a lead for manual investigation
   * against PawaPay's own statement/dashboard, not as an automatic fee figure.
   */
  static async reconcileWalletBalances(provider: PawaPayProvider): Promise<WalletBalanceDrift[]> {
    const balances = await provider.getWalletBalances()
    const drifts: WalletBalanceDrift[] = []

    for (const balance of balances) {
      const ourBalance = await LedgerService.getAccountBalance(
        `MOBILE_MONEY_CLEARING.${balance.currency}`
      )
      const difference = balance.amount - ourBalance

      drifts.push({
        country: balance.country,
        currency: balance.currency,
        ourClearingBalance: ourBalance.toString(),
        pawapayActualBalance: balance.amount.toString(),
        difference: difference.toString(),
      })
    }

    return drifts
  }
}
