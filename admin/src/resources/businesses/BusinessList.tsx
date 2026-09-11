import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import StorefrontIcon from '@mui/icons-material/StorefrontOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmptyOutlined'
import BlockIcon from '@mui/icons-material/Block'
import type { SvgIconComponent } from '@mui/icons-material'
import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SearchInput,
  SelectInput,
  TopToolbar,
  CreateButton,
  ExportButton,
  SortButton,
  useListContext,
  useGetList,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search name or email" />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: 'pending_approval', name: 'Pending approval' },
      { id: 'active', name: 'Active' },
      { id: 'suspended', name: 'Suspended' },
      { id: 'terminated', name: 'Terminated' },
    ]}
  />,
]

function BusinessListActions() {
  return (
    <TopToolbar>
      <SortButton fields={['created_at', 'name', 'code', 'email', 'status']} />
      <CreateButton />
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

function BusinessStats() {
  const { data: businesses, isPending } = useGetList('businesses')
  const { filterValues, setFilters } = useListContext()

  const currentStatus = filterValues?.status

  const total = businesses?.length || 0
  const activeCount = businesses?.filter((b) => b.status === 'active').length || 0
  const pendingCount = businesses?.filter((b) => b.status === 'pending_approval').length || 0
  const suspendedCount = businesses?.filter((b) => b.status === 'suspended').length || 0

  const handleStatusFilter = (status?: string) => {
    if (!status || currentStatus === status) {
      const next = { ...filterValues }
      delete next.status
      setFilters(next)
    } else {
      setFilters({ ...filterValues, status })
    }
  }

  return (
    <Box sx={{ p: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <StatTile
          label="Total"
          value={total}
          icon={StorefrontIcon}
          color="#5B4FE9"
          loading={isPending}
          active={!currentStatus}
          onClick={() => handleStatusFilter(undefined)}
        />
        <StatTile
          label="Actives"
          value={activeCount}
          icon={CheckCircleOutlineIcon}
          color="#10B981"
          loading={isPending}
          active={currentStatus === 'active'}
          onClick={() => handleStatusFilter('active')}
        />
        <StatTile
          label="En attente"
          value={pendingCount}
          icon={HourglassEmptyIcon}
          color="#D97706"
          loading={isPending}
          active={currentStatus === 'pending_approval'}
          onClick={() => handleStatusFilter('pending_approval')}
        />
        <StatTile
          label="Suspendues"
          value={suspendedCount}
          icon={BlockIcon}
          color="#EF4444"
          loading={isPending}
          active={currentStatus === 'suspended'}
          onClick={() => handleStatusFilter('suspended')}
        />
      </Stack>
    </Box>
  )
}

export function BusinessList() {
  return (
    <List
      filters={filters}
      actions={<BusinessListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={25}
    >
      <BusinessStats />
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" sortBy="id" />
        <TextField source="code" sortBy="code" />
        <TextField source="name" sortBy="name" />
        <TextField source="email" sortBy="email" />
        <FunctionField label="Plan" render={(r) => r.plan?.name || '—'} sortBy="plan.name" />
        <StatusField source="status" sortBy="status" />
        <DateField source="created_at" showTime sortBy="created_at" />
      </Datagrid>
    </List>
  )
}
