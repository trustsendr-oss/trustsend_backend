import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import { useRecordContext } from 'react-admin'

const COLOR_MAP: Record<string, ChipProps['color']> = {
  active: 'success',
  approved: 'success',
  resolved: 'success',
  current: 'success',
  pending_approval: 'warning',
  pending: 'warning',
  in_review: 'warning',
  submitted: 'warning',
  under_review: 'warning',
  held: 'warning',
  awaiting_payout: 'info',
  processing: 'info',
  failed: 'error',
  paid: 'success',
  cancelled: 'default',
  investigating: 'warning',
  opened: 'warning',
  past_due: 'warning',
  not_started: 'default',
  inactive: 'default',
  archived: 'default',
  suspended: 'error',
  terminated: 'error',
  rejected: 'error',
  expired: 'error',
  // Likiliba groups, rounds, contributions, penalties, members and invitations.
  recruiting: 'info',
  locked: 'warning',
  completed: 'success',
  scheduled: 'default',
  collecting: 'info',
  waiting_funds: 'warning',
  escalated: 'error',
  paid_out: 'success',
  confirmed: 'success',
  late: 'warning',
  covered: 'warning',
  netted: 'default',
  in_debt: 'error',
  waived: 'default',
  admitted: 'info',
  committed: 'success',
  accepted: 'info',
  declined: 'default',
  revoked: 'default',
  left: 'default',
  removed: 'default',
}

function label(status: string) {
  return status.replace(/_/g, ' ')
}

export function StatusField({
  source = 'status',
  sortBy: _sortBy,
  sortable: _sortable,
  label: _label,
}: {
  source?: string
  sortBy?: string
  sortable?: boolean
  label?: string
}) {
  const record = useRecordContext()
  if (!record) return null
  const status = record[source]
  if (!status) return null
  return (
    <Chip
      label={label(status)}
      color={COLOR_MAP[status] || 'default'}
      size="small"
      variant={COLOR_MAP[status] ? 'filled' : 'outlined'}
      sx={{ textTransform: 'capitalize', fontWeight: 600 }}
    />
  )
}

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip
      label={label(status)}
      color={COLOR_MAP[status] || 'default'}
      size="small"
      variant={COLOR_MAP[status] ? 'filled' : 'outlined'}
      sx={{ textTransform: 'capitalize', fontWeight: 600 }}
    />
  )
}
