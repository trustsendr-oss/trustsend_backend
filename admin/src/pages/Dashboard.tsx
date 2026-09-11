import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Skeleton from '@mui/material/Skeleton'
import Divider from '@mui/material/Divider'
import { useMemo } from 'react'
import { Title, useGetIdentity, useGetList } from 'react-admin'
import { useNavigate } from 'react-router-dom'
import type { SvgIconComponent } from '@mui/icons-material'
import BadgeIcon from '@mui/icons-material/BadgeOutlined'
import StorefrontIcon from '@mui/icons-material/StorefrontOutlined'
import GroupIcon from '@mui/icons-material/GroupOutlined'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUserOutlined'
import GavelIcon from '@mui/icons-material/GavelOutlined'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLongOutlined'
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
  onClick,
}: {
  label: string
  value: number
  icon: SvgIconComponent
  color: string
  loading: boolean
  onClick?: () => void
}) {
  return (
    <Card
      onClick={onClick}
      sx={{
        flex: '1 1 200px',
        minWidth: 200,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': onClick
          ? { transform: 'translateY(-2px)', boxShadow: 4 }
          : undefined,
      }}
    >
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
            {loading ? (
              <Skeleton width={48} height={40} />
            ) : (
              <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5 }}>
                {value}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}22`,
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

function AttentionList<T extends { id: number | string }>({
  title,
  items,
  isLoading,
  renderPrimary,
  renderSecondary,
  emptyText,
  onSelect,
}: {
  title: string
  items: T[] | undefined
  isLoading: boolean
  renderPrimary: (item: T) => string
  renderSecondary: (item: T) => string
  emptyText: string
  onSelect: (item: T) => void
}) {
  return (
    <Card sx={{ flex: '1 1 320px', minWidth: 320 }}>
      <CardContent sx={{ pb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        {isLoading ? (
          <Stack spacing={1}>
            <Skeleton height={40} />
            <Skeleton height={40} />
          </Stack>
        ) : !items || items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {emptyText}
          </Typography>
        ) : (
          <List dense disablePadding>
            {items.slice(0, 6).map((item, i) => (
              <Box key={item.id}>
                <ListItemButton onClick={() => onSelect(item)} sx={{ borderRadius: 1 }}>
                  <ListItemText primary={renderPrimary(item)} secondary={renderSecondary(item)} />
                </ListItemButton>
                {i < Math.min(items.length, 6) - 1 && <Divider component="li" />}
              </Box>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { data: identity } = useGetIdentity()
  const navigate = useNavigate()

  const { data: agents, isPending: agentsLoading } = useGetList('agents')
  const { data: businesses, isPending: businessesLoading } = useGetList('businesses')
  const { data: users, isPending: usersLoading } = useGetList('users')
  const { data: pendingKyc, isPending: kycLoading } = useGetList('kyc', {
    filter: { status: 'pending' },
  })
  const { data: openDisputes, isPending: disputesLoading } = useGetList('disputes', {
    filter: { status: 'opened' },
  })
  // Computed once per mount, not per render: a fresh Date.now() on every render would change
  // this string on every re-render (Dashboard re-renders repeatedly as its ~6 independent
  // useGetList calls each resolve), which changes the react-query cache key below and was
  // causing /admin/transactions to be re-fetched on every render instead of once.
  const last24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), [])
  const {
    data: failedTransactions,
    total: failedTransactionsTotal,
    isPending: failedTransactionsLoading,
  } = useGetList('transactions', {
    pagination: { page: 1, perPage: 6 },
    sort: { field: 'created_at', order: 'DESC' },
    filter: { status: 'failed', date_from: last24h },
  })

  const pendingAgents = agents?.filter((a) => a.status === 'pending_approval') || []
  const activeAgents = agents?.filter((a) => a.status === 'active') || []
  const pendingBusinesses = businesses?.filter((b) => b.status === 'pending_approval') || []
  const activeBusinesses = businesses?.filter((b) => b.status === 'active') || []

  return (
    <Box sx={{ pb: 4 }}>
      <Title title="Overview" />
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Welcome back{identity?.fullName ? `, ${identity.fullName.split(' ')[0]}` : ''}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Here's what's happening across the platform right now.
        </Typography>
      </Box>

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <StatCard
          label="Active agents"
          value={activeAgents.length}
          icon={BadgeIcon}
          color="#5B4FE9"
          loading={agentsLoading}
          onClick={() => navigate('/agents')}
        />
        <StatCard
          label="Agents pending approval"
          value={pendingAgents.length}
          icon={BadgeIcon}
          color="#D97706"
          loading={agentsLoading}
          onClick={() => navigate('/agents')}
        />
        <StatCard
          label="Active businesses"
          value={activeBusinesses.length}
          icon={StorefrontIcon}
          color="#0EA5A5"
          loading={businessesLoading}
          onClick={() => navigate('/businesses')}
        />
        <StatCard
          label="Businesses pending approval"
          value={pendingBusinesses.length}
          icon={StorefrontIcon}
          color="#D97706"
          loading={businessesLoading}
          onClick={() => navigate('/businesses')}
        />
        <StatCard
          label="Registered users"
          value={users?.length || 0}
          icon={GroupIcon}
          color="#2563EB"
          loading={usersLoading}
          onClick={() => navigate('/users')}
        />
        <StatCard
          label="KYC cases pending"
          value={pendingKyc?.length || 0}
          icon={VerifiedUserIcon}
          color="#D97706"
          loading={kycLoading}
          onClick={() => navigate('/kyc')}
        />
        <StatCard
          label="Open disputes"
          value={openDisputes?.length || 0}
          icon={GavelIcon}
          color="#DC2626"
          loading={disputesLoading}
          onClick={() => navigate('/disputes')}
        />
        <StatCard
          label="Failed transactions (24h)"
          value={failedTransactionsTotal || 0}
          icon={ReceiptLongIcon}
          color="#DC2626"
          loading={failedTransactionsLoading}
          onClick={() => navigate('/transactions?filter=' + encodeURIComponent(JSON.stringify({ status: 'failed' })))}
        />
      </Stack>

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <AttentionList
          title="Agents awaiting approval"
          items={pendingAgents}
          isLoading={agentsLoading}
          renderPrimary={(a) => a.full_name}
          renderSecondary={(a) => a.email}
          emptyText="Nothing waiting — all caught up."
          onSelect={(a) => navigate(`/agents/${a.id}/show`)}
        />
        <AttentionList
          title="Businesses awaiting approval"
          items={pendingBusinesses}
          isLoading={businessesLoading}
          renderPrimary={(b) => b.name}
          renderSecondary={(b) => b.email}
          emptyText="Nothing waiting — all caught up."
          onSelect={(b) => navigate(`/businesses/${b.id}/show`)}
        />
        <AttentionList
          title="KYC cases pending review"
          items={pendingKyc}
          isLoading={kycLoading}
          renderPrimary={(k) => `${k.subject_type} #${k.subject_id} — ${k.verification_type}`}
          renderSecondary={(k) => `submitted ${k.submitted_at ?? '—'}`}
          emptyText="No pending KYC cases."
          onSelect={(k) => navigate(`/kyc/${k.id}/show`)}
        />
        <AttentionList
          title="Open disputes"
          items={openDisputes}
          isLoading={disputesLoading}
          renderPrimary={(d) => `${d.raised_by_type} #${d.raised_by_id}`}
          renderSecondary={(d) => d.reason}
          emptyText="No open disputes."
          onSelect={(d) => navigate(`/disputes/${d.id}/show`)}
        />
        <AttentionList
          title="Recent failed transactions (24h)"
          items={failedTransactions}
          isLoading={failedTransactionsLoading}
          renderPrimary={(t) => `${t.id} — ${t.type}`}
          renderSecondary={(t) => t.initiated_by_name}
          emptyText="No failed transactions in the last 24 hours."
          onSelect={(t) => navigate(`/transactions/${t.id}/show`)}
        />
      </Stack>
    </Box>
  )
}
