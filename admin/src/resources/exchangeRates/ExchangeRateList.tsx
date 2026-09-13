import { useState } from 'react'
import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SearchInput,
  TopToolbar,
  useNotify,
  useRefresh,
} from 'react-admin'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import RefreshIcon from '@mui/icons-material/RefreshOutlined'
import { adminActions } from '../../providers/dataProvider'
import { CurrencyLogo } from '../currencies/CurrencyLogo'

type RateRecord = {
  currency_code: string
  logo_url?: string
  source: 'base' | 'manual' | 'market' | null
  margin_percent: number
  is_stale: boolean
}

const filters = [<SearchInput source="q" alwaysOn placeholder="Search currency" />]

function RefreshRatesButton() {
  const notify = useNotify()
  const refresh = useRefresh()
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const { updated } = await adminActions.refreshExchangeRates()
      notify(`${updated} market rates updated`, { type: 'success' })
      refresh()
    } catch (error) {
      notify((error as Error).message || 'Rate refresh failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="small"
      onClick={run}
      disabled={loading}
      startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon fontSize="small" />}
    >
      Refresh market rates
    </Button>
  )
}

const SOURCE_CHIP: Record<string, { label: string; color: 'default' | 'primary' | 'warning' }> = {
  base: { label: 'Base', color: 'default' },
  market: { label: 'Market', color: 'primary' },
  manual: { label: 'Manual', color: 'warning' },
}

export function ExchangeRateList() {
  return (
    <List
      filters={filters}
      perPage={50}
      pagination={false}
      actions={
        <TopToolbar>
          <RefreshRatesButton />
        </TopToolbar>
      }
      title="Exchange rates (per 1 USD)"
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <FunctionField
          label="Currency"
          sortBy="currency_code"
          render={(record: RateRecord) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CurrencyLogo src={record.logo_url} code={record.currency_code} />
              <Box component="span" sx={{ fontWeight: 600 }}>
                {record.currency_code}
              </Box>
            </Box>
          )}
        />
        <TextField source="name" />
        <TextField source="market_rate" label="Market rate" emptyText="—" />
        <TextField source="manual_rate" label="Manual rate" emptyText="—" />
        <FunctionField
          label="Rate used"
          render={(record: RateRecord & { effective_rate: string | null }) =>
            record.effective_rate ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {record.effective_rate}
                </Box>
                {record.source && (
                  <Chip size="small" variant="outlined" {...SOURCE_CHIP[record.source]} />
                )}
              </Box>
            ) : (
              <Chip size="small" color="error" label={record.is_stale ? 'Stale' : 'Missing'} />
            )
          }
        />
        <FunctionField label="Margin" render={(record: RateRecord) => `${record.margin_percent}%`} />
        <DateField source="market_updated_at" label="Market update" showTime emptyText="—" />
      </Datagrid>
    </List>
  )
}
