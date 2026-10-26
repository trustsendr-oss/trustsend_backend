import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { apiFetch } from '../../providers/httpClient'
import { formatCents, NETWORK_LABEL } from './format'

type TreasuryNetwork = {
  network: string
  testnet_name: string | null
  gas_token: string
  gas_balance: string
  gas_minimum: string
  gas_low: boolean
  tokens: Array<{
    token_symbol: string
    balance: string
    pending_withdrawals: string
    pending_count: number
    short: boolean
  }>
  error: string | null
}

/**
 * The treasury's balance on each withdrawal network, read from the chain. One address, but a
 * separate balance per network: USDT on Polygon cannot pay a BSC withdrawal, and each network
 * needs its own coin for fees.
 */
export function TreasuryPanel() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Overview>('/admin/crypto-treasury')
      .then(setData)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Treasury unavailable'))
  }, [])

  if (error) return <Alert severity="error" sx={{ m: 2 }}>Treasury balances unavailable: {error}</Alert>
  if (!data) return null

  return (
    <>
      <WalletBalances
        title="Hot wallet — sends automatic withdrawals"
        wallet={data.hot_wallet}
        missing="No hot wallet configured (CRYPTO_HOT_WALLET_PRIVATE_KEY): every withdrawal is sent by staff."
      />
      <WalletBalances
        title="Treasury — staff send the others from here"
        wallet={data}
        missing="Set CRYPTO_TREASURY_ADDRESS to see the treasury's balance on each network before sending."
      />
    </>
  )
}

type WalletView = { address: string | null; networks: TreasuryNetwork[] }
type Overview = WalletView & { hot_wallet: WalletView }

function WalletBalances({ title, wallet, missing }: { title: string; wallet: WalletView; missing: string }) {
  if (!wallet.address) {
    return (
      <Alert severity="info" sx={{ m: 2, mb: 0 }}>
        {missing}
      </Alert>
    )
  }
  const data = wallet
  return (
    <Box sx={{ p: 2, pb: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
        {data.address}
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1 }}>
        {data.networks.map((row) => (
          <Card key={row.network} variant="outlined" sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                {NETWORK_LABEL[row.network] ?? row.network}
                {row.testnet_name ? ` ${row.testnet_name}` : ''}
              </Typography>
              {row.error ? (
                <Alert severity="warning">Unreachable: {row.error}</Alert>
              ) : (
                <Stack spacing={0.75}>
                  {row.tokens.map((token) => (
                    <Stack key={token.token_symbol} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatCents(token.balance, token.token_symbol)}
                      </Typography>
                      {token.pending_count > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          · {formatCents(token.pending_withdrawals, '').trim()} waiting ({token.pending_count})
                        </Typography>
                      )}
                      {token.short && <Chip size="small" color="error" label="Not enough to send" />}
                    </Stack>
                  ))}
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {row.gas_balance} {row.gas_token} for fees
                    </Typography>
                    {row.gas_low && (
                      <Chip size="small" color="warning" label={`Below ${row.gas_minimum} ${row.gas_token}`} />
                    )}
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
