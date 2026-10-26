import { getAddress } from 'ethers'
import env from '#start/env'
import LedgerTransaction from '#models/ledger_transaction'
import { HotWallet } from '#services/crypto/hot_wallet'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import {
  availablePayoutRails,
  networkSpec,
  type EvmNetwork,
  type StablecoinSymbol,
} from '#services/crypto/crypto_networks'

/** The coin each network charges its fees in. */
const GAS_TOKEN: Record<EvmNetwork, string> = {
  ethereum: 'ETH',
  polygon: 'POL',
  arbitrum: 'ETH',
  optimism: 'ETH',
  base: 'ETH',
  bsc: 'BNB',
}

/**
 * Below this, the treasury may not afford the fees of the next withdrawals. Configurable as
 * `CRYPTO_TREASURY_MIN_GAS=polygon=1,bsc=0.01` (whole coins); these defaults cover dozens of
 * token transfers at ordinary fee levels.
 */
const DEFAULT_MIN_GAS: Record<EvmNetwork, number> = {
  ethereum: 0.01,
  polygon: 1,
  arbitrum: 0.001,
  optimism: 0.001,
  base: 0.001,
  bsc: 0.01,
}

/** `balanceOf(address)` selector. */
const BALANCE_OF = '0x70a08231'

export type TreasuryNetworkBalance = {
  network: EvmNetwork
  testnet_name: string | null
  gas_token: string
  /** Whole coins, as a decimal string. */
  gas_balance: string
  gas_minimum: string
  gas_low: boolean
  tokens: Array<{
    token_symbol: StablecoinSymbol
    /** Cents of the peg currency, like every amount in the app. */
    balance: string
    /** Withdrawals waiting to be sent on this network in this token (cents). */
    pending_withdrawals: string
    pending_count: number
    /** The balance does not cover the withdrawals already waiting. */
    short: boolean
  }>
  error: string | null
}

function minimumGas(network: EvmNetwork): number {
  for (const pair of (env.get('CRYPTO_TREASURY_MIN_GAS', '') ?? '').split(',')) {
    const [name, value] = pair.split('=').map((part) => part.trim())
    if (name === network && value && Number.isFinite(Number(value))) return Number(value)
  }
  return DEFAULT_MIN_GAS[network]
}

/** wei → « 1.2345 » (18 decimals, 4 shown). */
function formatCoin(wei: bigint): string {
  const whole = wei / 10n ** 18n
  const fraction = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, '0')
  return `${whole}.${fraction}`
}

/**
 * What the treasury holds on each network withdrawals go out on, against what is waiting.
 *
 * One address, but a separate balance per network: USDT on Polygon cannot pay a BSC withdrawal,
 * and each network also needs its own coin (POL, BNB…) for fees. Read-only, from the chain.
 */
export class CryptoTreasuryService {
  static address(): string | null {
    const raw = env.get('CRYPTO_TREASURY_ADDRESS')
    if (!raw) return null
    try {
      return getAddress(raw.trim())
    } catch {
      return null
    }
  }

  /**
   * Both wallets withdrawals leave from: the treasury (sent by staff) and the hot wallet (sent
   * automatically, the one to top up most often). `null` when not configured.
   */
  static async overview(provider = new AlchemyProvider()) {
    const hotAddress = HotWallet.fromEnv()?.address ?? null
    const [treasury, hotWallet] = await Promise.all([
      CryptoTreasuryService.balances(provider, CryptoTreasuryService.address()),
      CryptoTreasuryService.balances(provider, hotAddress),
    ])
    return { ...treasury, hot_wallet: hotWallet }
  }

  static async balances(
    provider = new AlchemyProvider(),
    address: string | null = CryptoTreasuryService.address()
  ): Promise<{
    address: string | null
    networks: TreasuryNetworkBalance[]
  }> {
    if (!address) return { address: null, networks: [] }

    const pending = await LedgerTransaction.query()
      .where('type', 'crypto_payout')
      .where('status', 'pending')
      .select('metadata')

    const rails = availablePayoutRails()
    const networks = [...new Set(rails.map((rail) => rail.network))]

    const results = await Promise.all(
      networks.map(async (network): Promise<TreasuryNetworkBalance> => {
        const spec = networkSpec(network)!
        const gasMinimum = minimumGas(network)
        const base = {
          network,
          testnet_name: spec.testnetName,
          gas_token: GAS_TOKEN[network],
          gas_minimum: String(gasMinimum),
        }
        try {
          const gasWei = BigInt(
            await provider.callRpc<string>(network, 'eth_getBalance', [address, 'latest'])
          )
          const tokens = await Promise.all(
            rails
              .filter((rail) => rail.network === network)
              .map(async (rail) => {
                const contract = spec.contracts[rail.tokenSymbol]!
                const raw = BigInt(
                  await provider.callRpc<string>(network, 'eth_call', [
                    {
                      to: contract.address,
                      data: `${BALANCE_OF}${address.slice(2).toLowerCase().padStart(64, '0')}`,
                    },
                    'latest',
                  ])
                )
                const balance = AlchemyProvider.convertRawTokenToHundredths(raw, contract.decimals)
                const waiting = pending
                  .map((txn) => (txn.metadata ?? {}) as Record<string, any>)
                  .filter(
                    (meta) => meta.network === network && meta.token_symbol === rail.tokenSymbol
                  )
                const waitingTotal = waiting.reduce(
                  (sum, meta) => sum + BigInt(meta.gross_amount ?? '0'),
                  0n
                )
                return {
                  token_symbol: rail.tokenSymbol,
                  balance: balance.toString(),
                  pending_withdrawals: waitingTotal.toString(),
                  pending_count: waiting.length,
                  short: balance < waitingTotal,
                }
              })
          )
          return {
            ...base,
            gas_balance: formatCoin(gasWei),
            gas_low: Number(formatCoin(gasWei)) < gasMinimum,
            tokens,
            error: null,
          }
        } catch (error) {
          // One network unreachable must not hide the others.
          return {
            ...base,
            gas_balance: '0',
            gas_low: false,
            tokens: [],
            error: (error as Error).message,
          }
        }
      })
    )
    return { address, networks: results }
  }
}
