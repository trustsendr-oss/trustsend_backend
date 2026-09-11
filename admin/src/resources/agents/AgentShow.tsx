import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {
  Show,
  useRecordContext,
  TextField,
  DateField,
  Labeled,
  TopToolbar,
  EditButton,
  FunctionField,
} from 'react-admin'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { formatMoney } from '../../components/MoneyField'

function AgentActions() {
  const record = useRecordContext()
  if (!record) return null

  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status === 'pending_approval' && (
        <ConfirmActionButton
          label="Approve"
          icon={CheckCircleOutlineIcon}
          color="success"
          confirmText={`Approve ${record.full_name} as an active agent?`}
          onConfirm={() => adminActions.agentApprove(record.id)}
        />
      )}
      {record.status === 'suspended' && (
        <ConfirmActionButton
          label="Reactivate"
          icon={PlayCircleOutlineIcon}
          color="success"
          confirmText={`Reactivate ${record.full_name}?`}
          onConfirm={() => adminActions.agentActivate(record.id)}
        />
      )}
      {(record.status === 'active' || record.status === 'pending_approval') && (
        <ReasonActionButton
          label="Suspend"
          icon={PauseCircleOutlineIcon}
          color="warning"
          onConfirm={(reason) => adminActions.agentSuspend(record.id, reason)}
        />
      )}
      {record.status !== 'terminated' && (
        <ReasonActionButton
          label="Terminate"
          icon={BlockIcon}
          color="error"
          onConfirm={(reason) => adminActions.agentDeactivate(record.id, reason)}
        />
      )}
      <EditButton />
    </TopToolbar>
  )
}

export function AgentShow() {
  return (
    <Show actions={<AgentActions />}>
      <AgentShowContent />
    </Show>
  )
}

function AgentShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.business_name || record.full_name}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Agent ID">
              <TextField source="id" />
            </Labeled>
            <Labeled label="Code">
              <TextField source="code" emptyText="—" />
            </Labeled>
            <Labeled label="Full name">
              <TextField source="full_name" />
            </Labeled>
            <Labeled label="Business/outlet name">
              <TextField source="business_name" emptyText="—" />
            </Labeled>
            <Labeled label="Email">
              <TextField source="email" />
            </Labeled>
            <Labeled label="Phone">
              <TextField source="phone" emptyText="—" />
            </Labeled>
            <Labeled label="Tier">
              <TextField source="tier" emptyText="—" />
            </Labeled>
            <Labeled label="Wallet ID">
              <TextField source="wallet_id" emptyText="—" />
            </Labeled>
            <Labeled label="Commission rate">
              <FunctionField render={(r: any) => (r.commission_rate != null ? `${r.commission_rate}%` : '—')} />
            </Labeled>
            <Labeled label="Created">
              <DateField source="created_at" showTime />
            </Labeled>
            <Labeled label="Last updated">
              <DateField source="updated_at" showTime emptyText="—" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
      <Card sx={{ mt: 2 }}>
        <CardHeader title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Location</Typography>} />
        <CardContent sx={{ pt: 0 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Region">
              <TextField source="region" emptyText="—" />
            </Labeled>
            <Labeled label="City">
              <TextField source="city" emptyText="—" />
            </Labeled>
            <Labeled label="Address">
              <TextField source="address" emptyText="—" />
            </Labeled>
            <Labeled label="Coordinates">
              <FunctionField
                render={(r: any) => (r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : '—')}
              />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
      <Card sx={{ mt: 2 }}>
        <CardHeader title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Operational limits</Typography>} />
        <CardContent sx={{ pt: 0 }}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Per-transaction limit">
              <FunctionField render={(r: any) => (r.per_transaction_limit ? formatMoney(r.per_transaction_limit, 'USD') : 'Uncapped')} />
            </Labeled>
            <Labeled label="Daily limit">
              <FunctionField render={(r: any) => (r.daily_limit ? formatMoney(r.daily_limit, 'USD') : 'Uncapped')} />
            </Labeled>
            <Labeled label="Monthly limit">
              <FunctionField render={(r: any) => (r.monthly_limit ? formatMoney(r.monthly_limit, 'USD') : 'Uncapped')} />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
