import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {
  Show,
  useRecordContext,
  TextField,
  DateField,
  Labeled,
  FunctionField,
  TopToolbar,
  ReferenceField,
} from 'react-admin'
import LockOpenIcon from '@mui/icons-material/LockOpenOutlined'
import BlockIcon from '@mui/icons-material/Block'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { formatAmount } from './format'

function RemittanceActions() {
  const record = useRecordContext()
  if (!record) return null
  if (record.status !== 'held' && record.status !== 'awaiting_payout') return <TopToolbar />

  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status === 'held' && (
        <ConfirmActionButton
          label="Release"
          icon={LockOpenIcon}
          color="success"
          confirmText="Clear the compliance hold? A cash pickup becomes payable at any agent; a wallet transfer is credited immediately."
          onConfirm={() => adminActions.remittanceRelease(record.id)}
        />
      )}
      <ReasonActionButton
        label="Reject & refund"
        icon={BlockIcon}
        color="error"
        helperText="The sender is refunded in full (amount + fee). The reason is recorded in the audit log."
        onConfirm={(reason) => adminActions.remittanceReject(record.id, reason)}
      />
    </TopToolbar>
  )
}

export function RemittanceShow() {
  return (
    <Show actions={<RemittanceActions />}>
      <RemittanceContent />
    </Show>
  )
}

function RemittanceContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.id}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>

      {record.hold_reason && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {record.hold_reason}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Amounts
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Sent">
              <FunctionField render={(r) => formatAmount(r.send_amount, r.source_currency)} />
            </Labeled>
            <Labeled label="Fee">
              <FunctionField render={(r) => formatAmount(r.fee, r.source_currency)} />
            </Labeled>
            <Labeled label="Debited">
              <FunctionField render={(r) => formatAmount(r.total_debited, r.source_currency)} />
            </Labeled>
            <Labeled label="Payout (guaranteed)">
              <FunctionField render={(r) => formatAmount(r.payout_amount, r.payout_currency)} />
            </Labeled>
            <Labeled label="FX margin">
              <FunctionField render={(r) => formatAmount(r.fx_margin, r.payout_currency)} />
            </Labeled>
            <Labeled label="Rate">
              <TextField source="rate" emptyText="—" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Parties (travel rule)
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Sender">
              <ReferenceField source="sender_user_id" reference="users" link="show">
                <FunctionField render={() => record.sender_name} />
              </ReferenceField>
            </Labeled>
            <Labeled label="Sender country">
              <TextField source="sender_country" />
            </Labeled>
            <Labeled label="Beneficiary">
              <TextField source="beneficiary_name" />
            </Labeled>
            <Labeled label="Beneficiary phone">
              <TextField source="beneficiary_phone" />
            </Labeled>
            <Labeled label="City">
              <TextField source="beneficiary_city" emptyText="—" />
            </Labeled>
            <Labeled label="Method">
              <FunctionField
                render={(r) =>
                  r.payout_method === 'cash_pickup'
                    ? 'Cash pickup'
                    : r.payout_method === 'mobile_money'
                      ? `Mobile money — ${r.payout_provider_code ?? '—'}`
                      : 'TrustSend wallet'
                }
              />
            </Labeled>
            <Labeled label="Purpose">
              <TextField source="purpose" emptyText="—" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Payout
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Paid by agent">
              <ReferenceField source="paid_by_agent_id" reference="agents" link="show" emptyText="—">
                <TextField source="full_name" />
              </ReferenceField>
            </Labeled>
            <Labeled label="ID document">
              <FunctionField
                render={(r) =>
                  r.beneficiary_id_type ? `${r.beneficiary_id_type} — ${r.beneficiary_id_number}` : '—'
                }
              />
            </Labeled>
            <Labeled label="PawaPay reference">
              <TextField source="payout_provider_reference" emptyText="—" />
            </Labeled>
            <Labeled label="Operator transaction">
              <TextField source="payout_provider_transaction_id" emptyText="—" />
            </Labeled>
            <Labeled label="Wrong phone attempts">
              <TextField source="verification_failures" />
            </Labeled>
            <Labeled label="Paid at">
              <DateField source="paid_at" showTime emptyText="—" />
            </Labeled>
            <Labeled label="Expires">
              <DateField source="expires_at" showTime />
            </Labeled>
            <Labeled label="Outcome">
              <TextField source="failure_reason" emptyText="—" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
