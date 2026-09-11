import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { List, Datagrid, TextField, DateField, FunctionField, SelectInput, TextInput, useGetList } from 'react-admin'
import type { SvgIconComponent } from '@mui/icons-material'
import CreditCardIcon from '@mui/icons-material/CreditCardOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import AcUnitIcon from '@mui/icons-material/AcUnitOutlined'
import BlockIcon from '@mui/icons-material/Block'
import { StatusField } from '../../components/StatusChip'
import { MoneyField } from '../../components/MoneyField'

const filters = [
  <SelectInput
    source="status"
    choices={['pending', 'active', 'frozen', 'terminated', 'failed'].map((s) => ({ id: s, name: s }))}
  />,
  <SelectInput
    source="owner_type"
    label="Owner"
    choices={[
      { id: 'user', name: 'User' },
      { id: 'business', name: 'Business' },
    ]}
  />,
  <TextInput source="brand" />,
  <TextInput source="currency_code" label="Currency" />,
]

function StatBox({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string
  value: number
  icon: SvgIconComponent
  color: string
  loading: boolean
}) {
  return (
    <Card sx={{ flex: '1 1 160px', minWidth: 160 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={36} height={32} />
            ) : (
              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.25 }}>
                {value}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}22`,
              color,
            }}
          >
            <Icon fontSize="small" />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Quick counts by status, fetched with perPage:1 since only the paginated `total` is needed —
 * cheap even though admin/cards is a real (server-side paginated) resource. */
function CardStats() {
  const { total: allTotal, isPending: allLoading } = useGetList('cards', { pagination: { page: 1, perPage: 1 } })
  const { total: activeTotal, isPending: activeLoading } = useGetList('cards', {
    pagination: { page: 1, perPage: 1 },
    filter: { status: 'active' },
  })
  const { total: frozenTotal, isPending: frozenLoading } = useGetList('cards', {
    pagination: { page: 1, perPage: 1 },
    filter: { status: 'frozen' },
  })
  const { total: terminatedTotal, isPending: terminatedLoading } = useGetList('cards', {
    pagination: { page: 1, perPage: 1 },
    filter: { status: 'terminated' },
  })

  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, mb: 2 }}>
      <StatBox label="Total cards" value={allTotal || 0} icon={CreditCardIcon} color="#2563EB" loading={allLoading} />
      <StatBox label="Active" value={activeTotal || 0} icon={CheckCircleIcon} color="#16A34A" loading={activeLoading} />
      <StatBox label="Frozen" value={frozenTotal || 0} icon={AcUnitIcon} color="#D97706" loading={frozenLoading} />
      <StatBox label="Terminated" value={terminatedTotal || 0} icon={BlockIcon} color="#DC2626" loading={terminatedLoading} />
    </Stack>
  )
}

export function CardList() {
  return (
    <Box>
      <CardStats />
      <List filters={filters} sort={{ field: 'created_at', order: 'DESC' }} perPage={25}>
        <Datagrid rowClick="show" bulkActionButtons={false}>
          <TextField source="id" />
          <FunctionField label="Owner" render={(r) => `${r.owner_type} #${r.owner_id}`} />
          <TextField source="brand" />
          <TextField source="masked" emptyText="—" />
          <MoneyField source="balance" currencySource="currency_code" />
          <StatusField source="status" />
          <DateField source="created_at" showTime />
        </Datagrid>
      </List>
    </Box>
  )
}
