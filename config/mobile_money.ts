import env from '#start/env'

/**
 * Mobile money (PawaPay) configuration.
 *
 * fee percentages default to 0 — we don't have a commercial fee schedule to encode yet.
 * Adjust MOBILE_MONEY_DEPOSIT_FEE_PERCENT / MOBILE_MONEY_PAYOUT_FEE_PERCENT once known.
 */
const pawaPayEnv = env.get('PAWAPAY_ENV', 'sandbox')

const mobileMoneyConfig = {
  pawapay: {
    baseUrl:
      pawaPayEnv === 'production' ? 'https://api.pawapay.io' : 'https://api.sandbox.pawapay.io',
    /** milliseconds — outbound HTTP calls to PawaPay must never hang indefinitely */
    requestTimeoutMs: 15_000,
  },

  fees: {
    depositFeePercent: Number(env.get('MOBILE_MONEY_DEPOSIT_FEE_PERCENT', '0')),
    payoutFeePercent: Number(env.get('MOBILE_MONEY_PAYOUT_FEE_PERCENT', '0')),
  },

  /**
   * In-process TTLs for PawaPay's toolkit endpoints (see PawaPayProvider). These are read
   * caches only — nothing money-moving is served from them, and every deposit/payout still
   * revalidates its provider against active-conf through getProviderConfig().
   */
  cache: {
    /** /v2/active-conf — the merchant's configured countries/providers/currencies/flags */
    activeConfigTtlMs: 60 * 60 * 1000,
    /** /v2/availability — meant to reflect current reality, so kept deliberately short */
    availabilityTtlMs: 30 * 1000,
    /**
     * The composed listPaymentMethods() result, per currency + operation type. This is the
     * one that spares the provider a round trip on every picker render. Raising it makes a
     * provider outage take longer to appear in the list; lowering it costs more calls to
     * PawaPay. It must stay well under activeConfigTtlMs to remain useful.
     */
    paymentMethodsTtlMs: 5 * 60 * 1000,
  },

  /** Reconciliation sweep thresholds — see MobileMoneyReconciliationService */
  reconciliation: {
    /** Transactions stuck "processing"/"initiated" longer than this get polled */
    staleAfterMinutes: 10,
    /** Beyond this, if PawaPay has no record at all, we give up and mark it failed locally */
    giveUpAfterMinutes: 60,
  },
}

export default mobileMoneyConfig
