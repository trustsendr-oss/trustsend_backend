import env from '#start/env'
import { SandboxMode } from '#services/sandbox/sandbox_mode'

/**
 * The stablecoin deposit rails we actually support, and what each one needs to be trusted.
 *
 * Everything that decides whether money is credited lives here: the token contracts (a transfer
 * of anything else is ignored, whatever symbol it claims), their decimals, the fiat currency each
 * token is pegged to (the only wallet currency it may credit), the name Alchemy gives the network
 * in its webhooks, and how many blocks must pile on top of a transfer before it is final enough
 * to credit.
 *
 * Two tables: mainnets for production, testnets for the sandbox (APP_MODE=sandbox). A deployment
 * only ever knows one of them, so a testnet token — free to anyone from a faucet — can never be
 * credited by production, and the sandbox never touches real money.
 *
 * EVM networks only. Deposit addresses are derived from an extended public key (see
 * deposit_address_deriver.ts), which secp256k1 allows and Solana's ed25519 does not; Tron (TRC-20)
 * is not covered by Alchemy's address-activity webhooks.
 */

export type EvmNetwork = 'ethereum' | 'polygon' | 'arbitrum' | 'optimism' | 'base' | 'bsc'
export type StablecoinSymbol = 'USDC' | 'USDT' | 'EURC'

export const EVM_NETWORKS: EvmNetwork[] = [
  'ethereum',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'bsc',
]
export const STABLECOINS: StablecoinSymbol[] = ['USDC', 'USDT', 'EURC']

/** A stablecoin only ever credits a wallet in the currency it is pegged to — no silent FX. */
export const TOKEN_CURRENCY: Record<StablecoinSymbol, string> = {
  USDC: 'USD',
  USDT: 'USD',
  EURC: 'EUR',
}

type NetworkSpec = {
  /**
   * `event.network` in Alchemy webhooks. Several spellings where Alchemy's naming is not
   * settled: an unknown name is ignored, so a missing alias silently drops deposits.
   */
  alchemyNames: string[]
  /**
   * Blocks on top of the transfer's block (inclusive) before it is credited. Ethereum is final
   * after two epochs; Polygon PoS has seen deep reorgs, so it waits longer; the rollups inherit
   * their ordering from the sequencer and settle on Ethereum.
   */
  confirmations: number
  /** Alchemy JSON-RPC host, used to re-read each transfer from the chain. */
  rpcHost: string
  /** Shown next to the network name: `Sepolia`, `Testnet`… `null` on mainnets. */
  testnetName: string | null
  contracts: Partial<Record<StablecoinSymbol, { address: string; decimals: number }>>
}

export const MAINNET_NETWORKS: Record<EvmNetwork, NetworkSpec> = {
  ethereum: {
    alchemyNames: ['ETH_MAINNET'],
    confirmations: 12,
    rpcHost: 'eth-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDC: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
      USDT: { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
      EURC: { address: '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c', decimals: 6 },
    },
  },
  polygon: {
    alchemyNames: ['MATIC_MAINNET', 'POLYGON_MAINNET'],
    confirmations: 64,
    rpcHost: 'polygon-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDC: { address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
      USDT: { address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 },
    },
  },
  arbitrum: {
    alchemyNames: ['ARB_MAINNET'],
    confirmations: 20,
    rpcHost: 'arb-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDC: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
      USDT: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', decimals: 6 },
    },
  },
  optimism: {
    alchemyNames: ['OPT_MAINNET'],
    confirmations: 20,
    rpcHost: 'opt-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDC: { address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
      USDT: { address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', decimals: 6 },
    },
  },
  base: {
    alchemyNames: ['BASE_MAINNET'],
    confirmations: 20,
    rpcHost: 'base-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDC: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
      EURC: { address: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1dd429', decimals: 6 },
    },
  },
  // BNB Smart Chain. Its stablecoins are Binance-Peg tokens (backed by Binance, not issued by
  // Tether or Circle) and use 18 decimals, not 6. Blocks are fast and finalise quickly.
  bsc: {
    alchemyNames: ['BNB_MAINNET', 'BSC_MAINNET'],
    confirmations: 15,
    rpcHost: 'bnb-mainnet.g.alchemy.com',
    testnetName: null,
    contracts: {
      USDT: { address: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
      USDC: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
    },
  },
}

/**
 * Sandbox networks. Tether publishes no official testnet USDT; Circle publishes testnet USDC
 * (faucet.circle.com), and BSC Testnet carries the widely used "USDT Token" test contract
 * (18 decimals, read on-chain). Few confirmations: nothing of value is at stake, and a developer
 * testing the flow should not wait minutes.
 */
export const TESTNET_NETWORKS: Partial<Record<EvmNetwork, NetworkSpec>> = {
  ethereum: {
    alchemyNames: ['ETH_SEPOLIA'],
    confirmations: 3,
    rpcHost: 'eth-sepolia.g.alchemy.com',
    testnetName: 'Sepolia',
    contracts: { USDC: { address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', decimals: 6 } },
  },
  polygon: {
    alchemyNames: ['MATIC_AMOY', 'POLYGON_AMOY'],
    confirmations: 3,
    rpcHost: 'polygon-amoy.g.alchemy.com',
    testnetName: 'Amoy',
    contracts: { USDC: { address: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582', decimals: 6 } },
  },
  arbitrum: {
    alchemyNames: ['ARB_SEPOLIA'],
    confirmations: 3,
    rpcHost: 'arb-sepolia.g.alchemy.com',
    testnetName: 'Sepolia',
    contracts: { USDC: { address: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', decimals: 6 } },
  },
  optimism: {
    alchemyNames: ['OPT_SEPOLIA'],
    confirmations: 3,
    rpcHost: 'opt-sepolia.g.alchemy.com',
    testnetName: 'Sepolia',
    contracts: { USDC: { address: '0x5fd84259d66cd46123540766be93dfe6d43130d7', decimals: 6 } },
  },
  base: {
    alchemyNames: ['BASE_SEPOLIA'],
    confirmations: 3,
    rpcHost: 'base-sepolia.g.alchemy.com',
    testnetName: 'Sepolia',
    contracts: { USDC: { address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', decimals: 6 } },
  },
  bsc: {
    alchemyNames: ['BNB_TESTNET', 'BSC_TESTNET'],
    confirmations: 3,
    rpcHost: 'bnb-testnet.g.alchemy.com',
    testnetName: 'Testnet',
    contracts: { USDT: { address: '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd', decimals: 18 } },
  },
}

/** Whether this deployment credits testnet transfers (the sandbox) rather than mainnet ones. */
export function usesTestnets(): boolean {
  return SandboxMode.isEnabled()
}

/** The spec of a network on this deployment's side of the line, or `null` if not served here. */
export function networkSpec(network: string): NetworkSpec | null {
  if (!isEvmNetwork(network)) return null
  return (usesTestnets() ? TESTNET_NETWORKS[network] : MAINNET_NETWORKS[network]) ?? null
}

export function isEvmNetwork(value: string): value is EvmNetwork {
  return (EVM_NETWORKS as string[]).includes(value)
}

/**
 * `MATIC_MAINNET` → `polygon` in production, `MATIC_AMOY` → `polygon` in the sandbox; `null` for
 * a network this deployment does not credit — a testnet event reaching production is ignored.
 */
export function networkFromAlchemy(alchemyName: string | undefined | null): EvmNetwork | null {
  const upper = (alchemyName ?? '').toUpperCase()
  return EVM_NETWORKS.find((network) => networkSpec(network)?.alchemyNames.includes(upper)) ?? null
}

/** The token a contract address is, on that network — or `null` for any other contract. */
export function tokenForContract(
  network: EvmNetwork,
  contractAddress: string | undefined | null
): { symbol: StablecoinSymbol; decimals: number; address: string } | null {
  const needle = (contractAddress ?? '').toLowerCase()
  if (!needle) return null
  const spec = networkSpec(network)
  if (!spec) return null
  for (const symbol of STABLECOINS) {
    const contract = spec.contracts[symbol]
    if (contract && contract.address === needle) return { symbol, ...contract }
  }
  return null
}

/**
 * Alchemy webhook id per network, from `ALCHEMY_WEBHOOK_IDS=polygon=wh_abc,arbitrum=wh_def`.
 * A network without a webhook is not watched, so it must not be offered: a deposit there would
 * reach the chain and never reach the wallet.
 */
export function webhookIdFor(network: EvmNetwork): string | null {
  const raw = env.get('ALCHEMY_WEBHOOK_IDS', '') ?? ''
  for (const pair of raw.split(',')) {
    const [name, id] = pair.split('=').map((part) => part.trim())
    if (name === network && id) return id
  }
  return null
}

/** Every (network, token) a deposit address can be requested for right now. */
export function availableDepositRails(): Array<{
  network: EvmNetwork
  tokenSymbol: StablecoinSymbol
  currencyCode: string
  confirmations: number
  testnetName: string | null
}> {
  if (!env.get('CRYPTO_DEPOSIT_XPUB')) return []
  return EVM_NETWORKS.filter((network) => webhookIdFor(network)).flatMap((network) => {
    const spec = networkSpec(network)
    if (!spec) return []
    return STABLECOINS.filter((symbol) => spec.contracts[symbol]).map((tokenSymbol) => ({
      network,
      tokenSymbol,
      currencyCode: TOKEN_CURRENCY[tokenSymbol],
      confirmations: spec.confirmations,
      testnetName: spec.testnetName,
    }))
  })
}

/*
|--------------------------------------------------------------------------
| Withdrawals (phase 1: reviewed and sent by staff)
|--------------------------------------------------------------------------
|
| Fewer networks than deposits: a withdrawal pays the network's fee, and on Ethereum that fee can
| exceed a small withdrawal. Everything here is a pricing or risk choice, so it is read from the
| environment rather than fixed in code:
|
|   CRYPTO_PAYOUT_NETWORKS=polygon,bsc          networks offered for withdrawals
|   CRYPTO_PAYOUT_NETWORK_FEES=polygon=0,bsc=0  flat network fee per withdrawal, in cents
|   CRYPTO_PAYOUT_MIN_AMOUNT=100                smallest withdrawal, in cents
|
*/

function parsePairs(raw: string | undefined | null): Map<string, string> {
  const pairs = new Map<string, string>()
  for (const pair of (raw ?? '').split(',')) {
    const [name, value] = pair.split('=').map((part) => part.trim())
    if (name && value !== undefined) pairs.set(name, value)
  }
  return pairs
}

/** Smallest withdrawal, in cents of the token's peg currency. */
export function payoutMinimum(): bigint {
  const raw = env.get('CRYPTO_PAYOUT_MIN_AMOUNT', '100') ?? '100'
  return /^\d+$/.test(raw) ? BigInt(raw) : 100n
}

/** Flat network fee charged on a withdrawal, in cents; 0 when not configured. */
export function payoutNetworkFee(network: EvmNetwork): bigint {
  const raw = parsePairs(env.get('CRYPTO_PAYOUT_NETWORK_FEES', '')).get(network)
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : 0n
}

/** Every (network, token) a withdrawal can be requested on right now. */
export function availablePayoutRails(): Array<{
  network: EvmNetwork
  tokenSymbol: StablecoinSymbol
  currencyCode: string
  networkFee: bigint
  minAmount: bigint
  confirmations: number
  testnetName: string | null
}> {
  const configured = (env.get('CRYPTO_PAYOUT_NETWORKS', 'polygon,bsc') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(isEvmNetwork)

  return configured.flatMap((network) => {
    const spec = networkSpec(network)
    if (!spec) return []
    return STABLECOINS.filter((symbol) => spec.contracts[symbol]).map((tokenSymbol) => ({
      network,
      tokenSymbol,
      currencyCode: TOKEN_CURRENCY[tokenSymbol],
      networkFee: payoutNetworkFee(network),
      minAmount: payoutMinimum(),
      confirmations: spec.confirmations,
      testnetName: spec.testnetName,
    }))
  })
}
