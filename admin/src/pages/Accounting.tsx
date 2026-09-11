import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import RefreshIcon from '@mui/icons-material/RefreshOutlined'
import { Title, useNotify } from 'react-admin'
import { adminActions } from '../providers/dataProvider'
import { formatMoney } from '../components/MoneyField'

const CURRENCIES = ['USD', 'CDF', 'XOF']

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card sx={{ flex: '1 1 420px', minWidth: 380 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        }
        action={action}
      />
      <CardContent sx={{ pt: 0 }}>{children}</CardContent>
    </Card>
  )
}

function BalanceSheetCard({ currency }: { currency: string }) {
  const notify = useNotify()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof adminActions.balanceSheet>> | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setData(await adminActions.balanceSheet(currency))
    } catch {
      notify('Failed to load balance sheet', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionCard
      title="Balance sheet"
      action={
        <Button size="small" startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon fontSize="small" />} onClick={load} disabled={loading}>
          {data ? 'Refresh' : 'Load'}
        </Button>
      }
    >
      {!data ? (
        <Typography variant="body2" color="text.secondary">
          Load to compute assets vs liabilities + equity for {currency}.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">Assets</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(data.assets, data.currency_code)}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">Liabilities</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(data.liabilities, data.currency_code)}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">Equity</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(data.equity, data.currency_code)}
            </Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" color="text.secondary">
              Revenue (all-time)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatMoney(data.revenue, data.currency_code)}
            </Typography>
          </Stack>
          <Box sx={{ pt: 1 }}>
            <Chip
              label={data.balanced ? 'Assets = Liabilities + Equity' : 'Not balanced — see note below'}
              color={data.balanced ? 'success' : 'error'}
              size="small"
            />
          </Box>
          {!data.balanced && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Wallet balances are reported as liabilities here regardless of how their ledger
              account is tagged internally. An imbalance usually means some ledger entries for
              this currency were posted against a wallet account whose code doesn't match its
              actual currency — check "Run reconciliation" for the affected wallets.
            </Alert>
          )}
        </Stack>
      )}
    </SectionCard>
  )
}

function RevenueCard({ currency }: { currency: string }) {
  const notify = useNotify()
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState<Awaited<ReturnType<typeof adminActions.accountingRevenue>> | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setData(await adminActions.accountingRevenue(currency, dateFrom || undefined, dateTo || undefined))
    } catch {
      notify('Failed to load revenue', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionCard title="Revenue">
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          size="small"
          type="date"
          label="From"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button size="small" variant="outlined" onClick={load} disabled={loading}>
          {loading ? <CircularProgress size={16} /> : 'Load'}
        </Button>
      </Stack>
      {!data ? (
        <Typography variant="body2" color="text.secondary">
          Load to see fees collected in {currency}, optionally filtered by period.
        </Typography>
      ) : data.by_account.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No revenue in this period.
        </Typography>
      ) : (
        <>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
            {formatMoney(data.total, data.currency_code)}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell align="right">Entries</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.by_account.map((a) => (
                <TableRow key={a.code}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell align="right">{a.entry_count}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(a.total, data.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </SectionCard>
  )
}

function ReconciliationCard() {
  const notify = useNotify()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<Awaited<ReturnType<typeof adminActions.reconcile>> | null>(null)

  const run = async () => {
    setLoading(true)
    try {
      setData(await adminActions.reconcile())
    } catch {
      notify('Reconciliation failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionCard title="Ledger integrity">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Checks every wallet's cached balance against its real ledger entries, and that total
        debits equal total credits platform-wide, per currency.
      </Typography>
      <Button variant="outlined" onClick={run} disabled={loading} sx={{ mb: 2 }}>
        {loading ? <CircularProgress size={16} /> : 'Run reconciliation'}
      </Button>
      {data && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {Object.entries(data.balancedByCurrency).map(([currency, balanced]) => (
              <Chip
                key={currency}
                label={`${currency}: ${balanced ? 'balanced' : 'IMBALANCED'}`}
                color={balanced ? 'success' : 'error'}
                size="small"
              />
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {data.walletsChecked} wallet(s) checked, {data.walletMismatches.length} mismatch(es).
          </Typography>
          {data.walletMismatches.length > 0 && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Wallet</TableCell>
                  <TableCell align="right">Expected (from ledger)</TableCell>
                  <TableCell align="right">Actual (cached)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.walletMismatches.map((m) => (
                  <TableRow key={m.walletId}>
                    <TableCell>#{m.walletId}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {m.expected}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {m.actual}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      )}
    </SectionCard>
  )
}

export function Accounting() {
  const [currency, setCurrency] = useState('USD')

  return (
    <Box sx={{ pb: 4 }}>
      <Title title="Accounting" />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Accounting
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Platform-wide chart of accounts, balance sheet, revenue and ledger integrity.
          </Typography>
        </Box>
        <TextField select size="small" label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} sx={{ width: 120 }}>
          {CURRENCIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <BalanceSheetCard currency={currency} />
        <RevenueCard currency={currency} />
        <ReconciliationCard />
      </Stack>
    </Box>
  )
}
