export type CryptoNetwork =
  | 'ethereum'
  | 'polygon'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'solana'

export type CryptoTokenSymbol = 'USDC' | 'USDT' | 'EURC'

export interface CryptoDepositAddressInfo {
  id: number
  userId: number | null
  businessId: number | null
  walletId: number
  network: CryptoNetwork | string
  tokenSymbol: CryptoTokenSymbol | string
  address: string
  memoTag: string | null
  status: 'active' | 'revoked'
  createdAt: string
}

export interface AlchemyWebhookTransfer {
  from: string
  to: string
  value: number | string | null
  rawContract?: {
    address: string
    decimal: string
    rawValue: string
  }
  asset?: string
  category?: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155'
  hash: string
  blockNum?: string
  logIndex?: number | string
}

export interface AlchemyWebhookActivityEvent {
  network: string
  activity: AlchemyWebhookTransfer[]
}

export interface AlchemyWebhookPayload {
  webhookId: string
  id: string
  createdAt: string
  type: 'ADDRESS_ACTIVITY' | string
  event: AlchemyWebhookActivityEvent
}

export interface CryptoPayoutRequest {
  initiatedByType: 'user' | 'business'
  initiatedById: number
  walletId: number
  amount: bigint
  currencyCode?: string
  destinationAddress: string
  network: CryptoNetwork | string
  tokenSymbol: CryptoTokenSymbol | string
  memoTag?: string
  correlationId: string
  idempotencyKey?: string
}

export interface CryptoPayoutResult {
  transactionId: string
  status: 'initiated' | 'processing' | 'completed' | 'failed'
  txHash?: string
  amount: bigint
  fee: bigint
  network: string
  tokenSymbol: string
  destinationAddress: string
}
