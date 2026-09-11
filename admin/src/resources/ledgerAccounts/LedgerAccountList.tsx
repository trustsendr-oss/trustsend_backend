import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { List, Datagrid, TextField, SelectInput, useListContext } from 'react-admin'
import { StatusField } from '../../components/StatusChip'
import { MoneyField, formatMoney } from '../../components/MoneyField'

const filters = [
  <SelectInput
    source="owner_type"
    alwaysOn
    choices={[
      { id: 'platform_internal', name: 'Platform internal' },
      { id: 'user_wallet', name: 'User wallet' },
      { id: 'agent_wallet', name: 'Agent wallet' },
      { id: 'business_wallet', name: 'Business wallet' },
    ]}
  />,
]

const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

/** Subtotals the currently-loaded page by account_type × currency — meaningful mainly for the
 * default "platform internal" view (a handful of accounts); individual wallet accounts are
 * better browsed one at a time via the filter above, not summed (hundreds of rows). */
function SubtotalsCard() {
  const { data, isPending } = useListContext()
  if (isPending || !data || data.length === 0) return null

  const subtotals = new Map<string, bigint>()
  for (const record of data) {
    const key = `${record.account_type}:${record.currency_code}`
    const current = subtotals.get(key) || 0n
    subtotals.set(key, current + BigInt(record.balance || 0))
  }

  const byType = new Map<string, { currency: string; total: bigint }[]>()
  for (const [key, total] of subtotals) {
    const [type, currency] = key.split(':')
    if (!byType.has(type)) byType.set(type, [])
    byType.get(type)!.push({ currency, total })
  }

  return (
    <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
        {[...byType.entries()].map(([type, currencies]) => (
          <Box key={type}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {TYPE_LABELS[type] || type}
            </Typography>
            {currencies.map((c) => (
              <Typography key={c.currency} variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(c.total.toString(), c.currency)}
              </Typography>
            ))}
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

export function LedgerAccountList() {
  return (
    <List
      filters={filters}
      filterDefaultValues={{ owner_type: 'platform_internal' }}
      sort={{ field: 'account_type', order: 'ASC' }}
      pagination={false}
      perPage={500}
    >
      <SubtotalsCard />
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="code" />
        <TextField source="name" />
        <TextField source="account_type" />
        <TextField source="owner_type" />
        <MoneyField source="balance" currencySource="currency_code" />
        <StatusField source="status" />
      </Datagrid>
    </List>
  )
}
