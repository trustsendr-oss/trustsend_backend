import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import ArchiveIcon from '@mui/icons-material/Inventory2Outlined'
import {
  Show,
  SimpleShowLayout,
  TextField,
  DateField,
  FunctionField,
  ReferenceField,
  TopToolbar,
  useRecordContext,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'

/**
 * Approving here publishes a rate to borrowers inside our own application, under our name, so the
 * decision is deliberately an explicit act with its own button rather than a status field anyone
 * can edit.
 *
 * A rejection carries its reason back to the institution verbatim: a refusal without one only
 * produces a resubmission of the same thing.
 */
function ReviewActions() {
  const record = useRecordContext()
  if (!record) return null

  return (
    <TopToolbar>
      {record.status === 'pending_review' && (
        <>
          <ConfirmActionButton
            label="Publish"
            icon={CheckCircleOutlineIcon}
            color="success"
            confirmText={`Publish "${record.name}" at ${record.interest_rate_percent}% per ${record.interest_period}? Borrowers will see it immediately.`}
            onConfirm={() => adminActions.financialProductApprove(record.id)}
          />
          <ReasonActionButton
            label="Reject"
            icon={BlockIcon}
            helperText="Sent to the institution word for word — say what to change."
            onConfirm={(notes) => adminActions.financialProductReject(record.id, notes)}
          />
        </>
      )}
      {record.status !== 'archived' && (
        <ConfirmActionButton
          label="Archive"
          icon={ArchiveIcon}
          color="inherit"
          confirmText={`Withdraw "${record.name}" from the catalogue? Accounts already sold under it keep their terms.`}
          onConfirm={() => adminActions.financialProductArchive(record.id)}
        />
      )}
    </TopToolbar>
  )
}

function RejectionNotice() {
  const record = useRecordContext()
  if (!record || record.status !== 'rejected' || !record.review_notes) return null

  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      Rejected — {record.review_notes}
    </Alert>
  )
}

/** Amounts arrive as smallest-unit digit strings; shown as such rather than guessed at. */
const money = (value: string | null, currency: string) =>
  value === null ? 'No limit' : `${value} ${currency} (smallest unit)`

export function FinancialProductShow() {
  return (
    <Show actions={<ReviewActions />}>
      <Stack sx={{ p: 2 }}>
        <RejectionNotice />
      </Stack>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="code" />
        <ReferenceField source="provider_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="kind" />
        <StatusField source="status" />
        <TextField source="description" emptyText="—" />
        <FunctionField
          label="Interest"
          render={(record: any) =>
            `${record.interest_rate_percent}% per ${record.interest_period}${
              record.interest_method
                ? ` — ${record.interest_method === 'flat' ? 'flat, on the original principal' : 'declining, on the balance outstanding'}`
                : ''
            }`
          }
        />
        <TextField source="currency_code" label="Currency" />
        <FunctionField
          label="Amount range"
          render={(record: any) =>
            `${money(record.min_amount, record.currency_code)} → ${money(record.max_amount, record.currency_code)}`
          }
        />
        <FunctionField
          label="Term"
          render={(record: any) =>
            record.term_months_min || record.term_months_max
              ? `${record.term_months_min ?? '?'} – ${record.term_months_max ?? '?'} months`
              : 'Open-ended'
          }
        />
        <FunctionField
          label="Fees"
          render={(record: any) =>
            [
              record.fee_flat ? `${record.fee_flat} flat` : null,
              record.fee_percent_bps ? `${record.fee_percent_bps / 100}%` : null,
              record.mandatory_savings_bps
                ? `${record.mandatory_savings_bps / 100}% held as compulsory savings`
                : null,
            ]
              .filter(Boolean)
              .join(' + ') || 'None'
          }
        />
        <DateField source="submitted_at" label="Submitted" showTime emptyText="—" />
        <DateField source="reviewed_at" label="Reviewed" showTime emptyText="—" />
      </SimpleShowLayout>
    </Show>
  )
}
