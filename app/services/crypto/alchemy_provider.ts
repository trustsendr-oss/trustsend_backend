import env from '#start/env'
import type { CryptoNetwork, CryptoTokenSymbol } from '#services/crypto/crypto_types.js'

export const KNOWN_CONTRACTS: Record<string, Record<string, { address: string; decimals: number }>> = {
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    EURC: { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1DD429', decimals: 6 },
  },
  polygon: {
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  },
  arbitrum: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  },
  optimism: {
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
  },
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  },
}

export class AlchemyProvider {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.get('ALCHEMY_API_KEY', '')
  }

  /**
   * Resolve Alchemy JSON-RPC endpoint for given network.
   */
  getRpcUrl(network: CryptoNetwork | string): string {
    const net = network.toLowerCase()
    const domainMap: Record<string, string> = {
      base: 'base-mainnet.g.alchemy.com',
      polygon: 'polygon-mainnet.g.alchemy.com',
      arbitrum: 'arb-mainnet.g.alchemy.com',
      optimism: 'opt-mainnet.g.alchemy.com',
      ethereum: 'eth-mainnet.g.alchemy.com',
      solana: 'solana-mainnet.g.alchemy.com',
    }

    const domain = domainMap[net] || 'base-mainnet.g.alchemy.com'
    return `https://${domain}/v2/${this.apiKey || 'demo'}`
  }

  /**
   * Execute JSON-RPC request against Alchemy.
   */
  async callRpc<T = any>(network: CryptoNetwork | string, method: string, params: any[] = []): Promise<T> {
    const url = this.getRpcUrl(network)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    })

    if (!response.ok) {
      throw new Error(`Alchemy RPC request failed with HTTP ${response.status}: ${await response.text()}`)
    }

    const data = (await response.json()) as any
    if (data.error) {
      throw new Error(`Alchemy RPC error: ${data.error.message || JSON.stringify(data.error)}`)
    }

    return data.result as T
  }

  /**
   * Verify an on-chain transaction receipt.
   */
  async getTransactionReceipt(network: CryptoNetwork | string, txHash: string): Promise<any> {
    return this.callRpc(network, 'eth_getTransactionReceipt', [txHash])
  }

  /**
   * Get latest block number.
   */
  async getBlockNumber(network: CryptoNetwork | string): Promise<number> {
    const hex = await this.callRpc<string>(network, 'eth_blockNumber', [])
    return Number.parseInt(hex, 16)
  }

  /**
   * Get token metadata / decimals.
   */
  getTokenInfo(network: CryptoNetwork | string, symbol: CryptoTokenSymbol | string): { address: string; decimals: number } | null {
    const net = network.toLowerCase()
    const sym = symbol.toUpperCase()
    return KNOWN_CONTRACTS[net]?.[sym] || null
  }

  /**
   * Format raw token amount to TumaPlus standard hundredths (minor units of USD/currency: 1.00 USD = 100).
   * E.g. 10.50 USDC with 6 decimals = 10_500_000 raw units -> returns 1050n (in hundredths).
   */
  static convertRawTokenToHundredths(rawAmount: bigint | string, decimals: number = 6): bigint {
    const raw = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount
    if (decimals >= 2) {
      const divisor = 10n ** BigInt(decimals - 2)
      return raw / divisor
    } else {
      const multiplier = 10n ** BigInt(2 - decimals)
      return raw * multiplier
    }
  }

  /**
   * Convert hundredths (e.g. 1050n = 10.50 USD) to on-chain raw token units (e.g. with 6 decimals -> 10_500_000n).
   */
  static convertHundredthsToRawToken(hundredths: bigint, decimals: number = 6): bigint {
    if (decimals >= 2) {
      const multiplier = 10n ** BigInt(decimals - 2)
      return hundredths * multiplier
    } else {
      const divisor = 10n ** BigInt(2 - decimals)
      return hundredths / divisor
    }
  }
}
