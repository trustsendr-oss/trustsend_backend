import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLongOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmptyOutlined'
import HighlightOffIcon from '@mui/icons-material/HighlightOffOutlined'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import StorefrontIcon from '@mui/icons-material/StorefrontOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SearchInput,
  SelectInput,
  BooleanInput,
  TextInput,
  DateInput,
  ExportButton,
  SortButton,
  TopToolbar,
  useRecordContext,
  useListContext,
  useGetList,
} from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { MoneyField, formatMoney } from '../../components/MoneyField'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mobile_money: 'Mobile money',
  card: 'Card',
  cash_agent: 'Cash (agent)',
  wallet: 'Wallet',
  float_transfer: 'Float transfer',
}

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search id / uuid / correlation id" />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      'initiated',
      'pending',
      'processing',
      'completed',
      'failed',
      'reversed',
      'reserved',
      'settled',
      'cancelled',
      'rejected',
    ].map((s) => ({ id: s, name: s }))}
  />,
  <TextInput key="type" source="type" label="Type" helperText="e.g. p2p_transfer, cash_in, card_topup" />,
  <SelectInput
    key="payment_method"
    source="payment_method"
    label="Payment method"
    choices={Object.entries(PAYMENT_METHOD_LABELS).map(([id, name]) => ({ id, name }))}
  />,
  <SelectInput
    key="initiated_by_type"
    source="initiated_by_type"
    label="Initiated by"
    choices={['user', 'agent', 'business', 'internal_user', 'system'].map((s) => ({ id: s, name: s }))}
  />,
  <TextInput key="currency_code" source="currency_code" label="Currency" />,
  <BooleanInput key="has_failure_reason" source="has_failure_reason" label="Has failure reason" />,
  <DateInput key="date_from" source="date_from" />,
  <DateInput key="date_to" source="date_to" />,
]

function TransactionListActions() {
  return (
    <TopToolbar>
      <SortButton fields={['created_at', 'amount', 'status', 'type', 'id']} />
      <ExportButton />
    </TopToolbar>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  color,
  loading,
  active,
  onClick,
}: {
  label: string
  value?: number
  icon: SvgIconComponent
  color: string
  loading?: boolean
  active?: boolean
  onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      variant="outlined"
      sx={{
        flex: '1 1 180px',
        minWidth: 160,
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: 2,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        borderColor: active ? color : 'divider',
        borderWidth: active ? 2 : 1,
        bgcolor: active ? `${color}0D` : 'background.paper',
        '&:hover': onClick
          ? {
              transform: 'translateY(-2px)',
              borderColor: color,
              boxShadow: 2,
            }
          : undefined,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={48} height={32} sx={{ mt: 0.5 }} />
            ) : (
              <Typography
                variant="h5"
                sx={{ fontWeight: 800, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}
              >
                {value !== undefined ? value.toLocaleString('fr-FR') : 0}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}18`,
              color,
            }}
          >
            <Icon />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

function TransactionStats() {
  const { data, total, isPending, filterValues, setFilters } = useListContext()

  // Base filter removing 'status' so status cards remain accurate even when one status is filtered
  const baseFilter = useMemo(() => {
    if (!filterValues) return {}
    const { status: _status, ...rest } = filterValues
    return rest
  }, [filterValues])

  const currentStatus = filterValues?.status

  // Count for all transactions matching current query (without status filter)
  const { total: allCount, isPending: allLoading } = useGetList(
    'transactions',
    { pagination: { page: 1, perPage: 1 }, filter: baseFilter },
    { enabled: Boolean(currentStatus) }
  )

  // Count for completed transactions
  const { total: completedCount, isPending: completedLoading } = useGetList('transactions', {
    pagination: { page: 1, perPage: 1 },
    filter: { ...baseFilter, status: 'completed' },
  })

  // Count for pending transactions
  const { total: pendingCount, isPending: pendingLoading } = useGetList('transactions', {
    pagination: { page: 1, perPage: 1 },
    filter: { ...baseFilter, status: 'pending' },
  })

  // Count for failed transactions
  const { total: failedCount, isPending: failedLoading } = useGetList('transactions', {
    pagination: { page: 1, perPage: 1 },
    filter: { ...baseFilter, status: 'failed' },
  })

  // Count for business-initiated transactions
  const { total: businessCount, isPending: businessLoading } = useGetList('transactions', {
    pagination: { page: 1, perPage: 1 },
    filter: { ...baseFilter, initiated_by_type: 'business' },
  })

  const currentInitiatedBy = filterValues?.initiated_by_type

  const handleStatusFilter = (status?: string) => {
    if (!status || currentStatus === status) {
      const next = { ...filterValues }
      delete next.status
      setFilters(next)
    } else {
      setFilters({ ...filterValues, status })
    }
  }

  const handleInitiatedByFilter = (type: string) => {
    if (currentInitiatedBy === type) {
      const next = { ...filterValues }
      delete next.initiated_by_type
      setFilters(next)
    } else {
      setFilters({ ...filterValues, initiated_by_type: type })
    }
  }

  // Volume aggregated by currency for transactions on current page
  const pageVolume = useMemo(() => {
    if (!data || data.length === 0) return []
    const map = new Map<string, bigint>()
    for (const record of data) {
      // If no status is filtered, aggregate only completed; if filtered, aggregate displayed rows
      const shouldInclude = currentStatus ? true : record.status === 'completed'
      if (shouldInclude && record.amount && record.currency_code) {
        try {
          const current = map.get(record.currency_code) || 0n
          map.set(record.currency_code, current + BigInt(record.amount))
        } catch {
          // ignore bigint conversion errors
        }
      }
    }
    return [...map.entries()].map(([currency, sum]) => ({
      currency,
      formatted: formatMoney(sum.toString(), currency),
    }))
  }, [data, currentStatus])

  const totalDisplay = currentStatus ? allCount : total
  const isLoadingTotal = currentStatus ? allLoading : isPending

  return (
    <Box sx={{ p: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, mb: pageVolume.length > 0 ? 1.5 : 0 }}>
        <StatTile
          label="Total"
          value={totalDisplay}
          icon={ReceiptLongIcon}
          color="#5B4FE9"
          loading={isLoadingTotal}
          active={!currentStatus && !currentInitiatedBy}
          onClick={() => {
            const next = { ...filterValues }
            delete next.status
            delete next.initiated_by_type
            setFilters(next)
          }}
        />
        <StatTile
          label="Complétées"
          value={completedCount}
          icon={CheckCircleOutlineIcon}
          color="#10B981"
          loading={completedLoading}
          active={currentStatus === 'completed'}
          onClick={() => handleStatusFilter('completed')}
        />
        <StatTile
          label="En attente"
          value={pendingCount}
          icon={HourglassEmptyIcon}
          color="#D97706"
          loading={pendingLoading}
          active={currentStatus === 'pending'}
          onClick={() => handleStatusFilter('pending')}
        />
        <StatTile
          label="Échouées"
          value={failedCount}
          icon={HighlightOffIcon}
          color="#EF4444"
          loading={failedLoading}
          active={currentStatus === 'failed'}
          onClick={() => handleStatusFilter('failed')}
        />
        <StatTile
          label="Business"
          value={businessCount}
          icon={StorefrontIcon}
          color="#0EA5A5"
          loading={businessLoading}
          active={currentInitiatedBy === 'business'}
          onClick={() => handleInitiatedByFilter('business')}
        />
      </Stack>

      {pageVolume.length > 0 && (
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
            pt: 0.5,
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
            <AccountBalanceWalletIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Volume sur cette page{currentStatus ? ` (${currentStatus})` : ' (succès)'} :
            </Typography>
          </Stack>
          {pageVolume.map(({ currency, formatted }) => (
            <Chip
              key={currency}
              label={formatted}
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 700,
                fontSize: 12,
                fontVariantNumeric: 'tabular-nums',
                bgcolor: 'action.hover',
              }}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

/** Status chip that surfaces failure_reason as a tooltip instead of a separate column — most
 * rows have none, so a dedicated column would be empty almost everywhere. */
function StatusWithFailureReason({ label: _label }: { label?: string; source?: string; sortBy?: string }) {
  const record = useRecordContext()
  if (!record) return null
  const chip = <StatusChip status={record.status} />
  return record.failure_reason ? <Tooltip title={record.failure_reason}>{chip}</Tooltip> : chip
}

function PaymentMethodField({ label: _label }: { label?: string; source?: string }) {
  const record = useRecordContext()
  if (!record?.payment_method) return <>—</>
  const methodLabel = PAYMENT_METHOD_LABELS[record.payment_method] || record.payment_method
  return (
    <>
      {methodLabel}
      {record.payment_channel && (
        <>
          {' '}
          <span style={{ color: 'var(--mui-palette-text-secondary, #666)', fontSize: 12 }}>
            ({record.payment_channel})
          </span>
        </>
      )}
    </>
  )
}

export function TransactionList() {
  return (
    <List
      filters={filters}
      actions={<TransactionListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={25}
    >
      <TransactionStats />
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="Transaction" sortBy="id" />
        <TextField source="type" sortBy="type" />
        <StatusWithFailureReason label="Status" source="status" sortBy="status" />
        <MoneyField source="amount" currencySource="currency_code" sortBy="amount" />
        <PaymentMethodField label="Payment method" source="payment_method" />
        <FunctionField label="Initiated by" render={(r) => r.initiated_by_name} />
        <DateField source="created_at" showTime sortBy="created_at" />
      </Datagrid>
    </List>
  )
}
