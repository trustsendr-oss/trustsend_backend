/** Cents of the peg currency → « 20.00 USD ». */
export function formatCents(cents: string | number | null | undefined, currency: string) {
  if (cents === null || cents === undefined) return '—'
  const value = Number(cents) / 100
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export const NETWORK_LABEL: Record<string, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  arbitrum: 'Arbitrum One',
  optimism: 'OP Mainnet',
  base: 'Base',
  bsc: 'BNB Smart Chain',
}

/** Block explorer of each network, to check a transaction before marking it sent. */
export const EXPLORER_TX: Record<string, string> = {
  ethereum: 'https://etherscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  optimism: 'https://optimistic.etherscan.io/tx/',
  base: 'https://basescan.org/tx/',
  bsc: 'https://bscscan.com/tx/',
}

/** Why a withdrawal is in the staff queue instead of leaving the hot wallet. */
export const AUTO_REASON_LABEL: Record<string, string> = {
  not_configured: 'No hot wallet configured: every withdrawal is sent by staff.',
  above_withdrawal_limit: 'Above the automatic limit per withdrawal.',
  above_daily_limit: "Above the account's automatic limit over 24 hours.",
  above_platform_daily_limit: "Above the platform's automatic limit over 24 hours.",
  hot_wallet_insufficient: 'The hot wallet did not hold enough tokens or fee coin: top it up.',
  network_not_served: 'This network is no longer served by this deployment.',
}

export const ISSUE_LABEL: Record<string, string> = {
  tx_not_found: 'The hash is unknown on this network after 6 hours (typo, wrong network, or dropped).',
  tx_reverted: 'The transaction failed on-chain: nothing was sent.',
  transfer_mismatch:
    'The transaction exists but is not this withdrawal: wrong token, destination or amount.',
  network_not_served: 'This network is no longer served by this deployment.',
}
