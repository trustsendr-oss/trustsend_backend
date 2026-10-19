import Wallet from '#models/wallet'
import { ExchangeRateService } from '#services/fx/exchange_rate_service'
import { CashOutHoldService } from '#services/transactions/cash_out_hold_service'

/**
 * Minimum an applicant must hold to become an agent: 100 USD, in ledger units (2 decimals).
 *
 * An agent starts by paying customers out of their own float; someone who cannot show this much
 * on their own account would be unable to serve their first withdrawal.
 */
export const AGENT_MIN_BALANCE_USD = 100_00n

/** Currencies counted towards the minimum: USD, and CDF at its USD equivalent. */
const COUNTED_CURRENCIES = ['USD', 'CDF'] as const

export type AgentEligibility = {
  eligible: boolean
  /** Required amount, USD ledger units. */
  minimum_usd: string
  /** Same requirement expressed in CDF at today's mid rate; null if no CDF rate is available. */
  minimum_cdf: string | null
  /** What counts today: USD available + CDF available converted to USD. */
  total_usd_equivalent: string
  balances: { currency_code: string; available: string }[]
  /** Missing amount in USD ledger units, 0 when eligible. */
  shortfall_usd: string
}

/**
 * Whether a customer meets the balance condition to become an agent.
 *
 * Counts the AVAILABLE balance (CashOutHoldService): money already reserved for a cash withdrawal
 * is leaving the account and cannot vouch for anything. CDF is converted at the mid-market rate,
 * without the swap margin — this is a measurement, not a conversion the customer pays for. When no
 * CDF rate is available, CDF counts for nothing: better to under-count than to let someone through
 * on a stale or missing rate.
 */
export class AgentEligibilityService {
  static async evaluate(userId: number): Promise<AgentEligibility> {
    const wallets = await Wallet.query()
      .withScopes((s) => s.primary())
      .where('user_id', userId)
      .where('status', 'active')
      .whereIn('currency_code', [...COUNTED_CURRENCIES])

    let usdAvailable = 0n
    let cdfAvailable = 0n
    const balances: AgentEligibility['balances'] = []

    for (const wallet of wallets) {
      const available = await CashOutHoldService.availableBalance(wallet)
      const positive = available > 0n ? available : 0n
      balances.push({ currency_code: wallet.currencyCode, available: positive.toString() })
      if (wallet.currencyCode === 'USD') usdAvailable += positive
      else cdfAvailable += positive
    }

    // CDF units per 1 USD, scaled — null when no usable rate exists.
    let cdfPerUsd: bigint | null = null
    let usdPerUsd: bigint | null = null
    try {
      // Same as a swap quote: a stale market rate is refreshed first (failures are logged and
      // the stored rate used), so a CDF holder is not refused only because no job ran today.
      await ExchangeRateService.refreshIfStale(['CDF'])
      const pair = await ExchangeRateService.pairRate('CDF', 'USD')
      cdfPerUsd = pair.from.perUsd
      usdPerUsd = pair.to.perUsd
    } catch {
      cdfPerUsd = null
    }

    const cdfInUsd =
      cdfPerUsd && usdPerUsd && cdfAvailable > 0n ? (cdfAvailable * usdPerUsd) / cdfPerUsd : 0n
    const total = usdAvailable + cdfInUsd
    const minimumCdf =
      cdfPerUsd && usdPerUsd
        ? (AGENT_MIN_BALANCE_USD * cdfPerUsd + usdPerUsd - 1n) / usdPerUsd
        : null

    return {
      eligible: total >= AGENT_MIN_BALANCE_USD,
      minimum_usd: AGENT_MIN_BALANCE_USD.toString(),
      minimum_cdf: minimumCdf?.toString() ?? null,
      total_usd_equivalent: total.toString(),
      balances,
      shortfall_usd: (total >= AGENT_MIN_BALANCE_USD
        ? 0n
        : AGENT_MIN_BALANCE_USD - total
      ).toString(),
    }
  }
}
