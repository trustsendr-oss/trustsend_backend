import env from '#start/env'

/**
 * Virtual/physical card issuing (Payscribe) configuration — mirrors config/mobile_money.ts's
 * shape and reasoning.
 */
const payscribeEnv = env.get('PAYSCRIBE_ENV', 'sandbox')

const cardsConfig = {
  payscribe: {
    baseUrl:
      payscribeEnv === 'production'
        ? 'https://payscribe.ng/api/v1'
        : 'https://sandbox.payscribe.ng/api/v1',
    /** milliseconds — outbound HTTP calls to Payscribe must never hang indefinitely */
    requestTimeoutMs: 15_000,
  },

  /** fee percentage on card creation/top-up funding, taken from the wallet debit — default 0
   * until a commercial fee schedule is set (same convention as mobile_money.fees). */
  fees: {
    issuanceFeePercent: Number(env.get('CARD_ISSUANCE_FEE_PERCENT', '0')),
    topupFeePercent: Number(env.get('CARD_TOPUP_FEE_PERCENT', '0')),
  },
}

export default cardsConfig
