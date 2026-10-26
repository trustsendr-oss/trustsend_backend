import { Interface, JsonRpcProvider, Transaction, Wallet } from 'ethers'
import env from '#start/env'
import { AlchemyProvider } from '#services/crypto/alchemy_provider'
import type { EvmNetwork } from '#services/crypto/crypto_networks'

const ERC20 = new Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
])

/** What automatic withdrawals need from a hot wallet. HotWallet is the real one; tests stub it. */
export interface PayoutSender {
  /** The hot wallet's public address. */
  readonly address: string
  /** Token balance (base units) and fee-coin balance (wei) on a network. */
  balances(network: EvmNetwork, tokenContract: string): Promise<{ token: bigint; gas: bigint }>
  /**
   * Builds and signs a token transfer without broadcasting it. The hash is final from here on:
   * it is recorded before anything reaches the network.
   */
  sign(
    network: EvmNetwork,
    tokenContract: string,
    to: string,
    amount: bigint
  ): Promise<{ hash: string; raw: string }>
  /** Broadcasts a signed transaction. Broadcasting the same one again is harmless. */
  broadcast(network: EvmNetwork, raw: string): Promise<void>
}

/**
 * The hot wallet that sends automatic withdrawals: a small, separate float the treasury tops up,
 * never the treasury itself. Its key (CRYPTO_HOT_WALLET_PRIVATE_KEY) is the only private key on
 * the server; the amounts it may send are capped (see crypto_payout_service.ts), so a breach
 * costs at most what it holds.
 */
export class HotWallet implements PayoutSender {
  readonly address: string
  #key: string
  #providers = new Map<EvmNetwork, JsonRpcProvider>()

  private constructor(key: string) {
    this.#key = key
    this.address = new Wallet(key).address
  }

  /** `null` when no key is configured: automatic withdrawals are then off. */
  static fromEnv(): HotWallet | null {
    const key = (env.get('CRYPTO_HOT_WALLET_PRIVATE_KEY') ?? '').trim()
    if (!key) return null
    try {
      return new HotWallet(key.startsWith('0x') ? key : `0x${key}`)
    } catch {
      // A malformed key must not crash the worker; it only disables automatic sending.
      return null
    }
  }

  #provider(network: EvmNetwork) {
    let provider = this.#providers.get(network)
    if (!provider) {
      provider = new JsonRpcProvider(new AlchemyProvider().getRpcUrl(network))
      this.#providers.set(network, provider)
    }
    return provider
  }

  async balances(network: EvmNetwork, tokenContract: string) {
    const provider = this.#provider(network)
    const [raw, gas] = await Promise.all([
      provider.call({
        to: tokenContract,
        data: ERC20.encodeFunctionData('balanceOf', [this.address]),
      }),
      provider.getBalance(this.address),
    ])
    return { token: BigInt(raw), gas }
  }

  async sign(network: EvmNetwork, tokenContract: string, to: string, amount: bigint) {
    const wallet = new Wallet(this.#key, this.#provider(network))
    // Fills chainId, nonce (pending), gas limit and fees from the network.
    const request = await wallet.populateTransaction({
      to: tokenContract,
      data: ERC20.encodeFunctionData('transfer', [to, amount]),
    })
    const raw = await wallet.signTransaction(request)
    return { hash: Transaction.from(raw).hash!.toLowerCase(), raw }
  }

  async broadcast(network: EvmNetwork, raw: string) {
    try {
      await this.#provider(network).broadcastTransaction(raw)
    } catch (error) {
      // Already in the mempool or mined: the job is done, not failed.
      const message = String((error as Error).message ?? '').toLowerCase()
      if (
        message.includes('already known') ||
        message.includes('nonce too low') ||
        message.includes('already imported')
      )
        return
      throw error
    }
  }
}
