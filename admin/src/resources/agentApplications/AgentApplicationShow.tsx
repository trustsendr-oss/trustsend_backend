import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import MuiTextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  Show,
  useRecordContext,
  TextField,
  DateField,
  Labeled,
  FunctionField,
  TopToolbar,
  useNotify,
  useRefresh,
  useRedirect,
} from 'react-admin'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ManageSearchIcon from '@mui/icons-material/ManageSearchOutlined'
import BlockIcon from '@mui/icons-material/Block'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { ApiError } from '../../providers/httpClient'

const TIERS = [
  { id: 'agent', name: 'Agent (needs a parent)' },
  { id: 'super_agent', name: 'Super agent (needs a parent)' },
  { id: 'distributor', name: 'Distributor' },
  { id: 'master', name: 'Master (no parent)' },
]

/**
 * Approval creates the agent record in pending_approval, linked to the applicant's account. The
 * agent then submits their own KYC from the app and is activated from the Agents page as usual.
 */
function ApproveButton() {
  const record = useRecordContext()
  const notify = useNotify()
  const refresh = useRefresh()
  const redirect = useRedirect()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tier, setTier] = useState(record?.sponsor ? 'agent' : 'distributor')
  const [parentId, setParentId] = useState(record?.sponsor?.id ? String(record.sponsor.id) : '')
  const [commission, setCommission] = useState('2.5')
  // agents.email is unique: when the applicant's address already belongs to another agent
  // record, the reviewer enters a different contact e-mail here.
  const [email, setEmail] = useState<string>(record?.applicant?.email ?? '')

  if (!record) return null
  const needsParent = tier === 'agent' || tier === 'super_agent'
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const valid = emailValid && (!needsParent || /^\d+$/.test(parentId))

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const result = await adminActions.agentApplicationApprove(record.id, {
        tier,
        email: email.trim(),
        parent_agent_id: parentId && tier !== 'master' ? Number(parentId) : undefined,
        commission_rate: commission ? Number(commission) : undefined,
      })
      notify('Application approved — agent created (pending approval)', { type: 'success' })
      setOpen(false)
      const agentId = (result as { approved_agent_id?: number } | undefined)?.approved_agent_id
      if (agentId) redirect('show', 'agents', agentId)
      else refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Approval failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="small"
        color="success"
        variant="outlined"
        startIcon={<CheckCircleOutlineIcon fontSize="small" />}
        onClick={() => setOpen(true)}
      >
        Approve
      </Button>
      <Dialog open={open} onClose={() => !loading && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Approve application</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Creates the agent for {record.applicant?.full_name || record.applicant?.email}. It stays
            pending until their agent KYC is approved and you activate it from the Agents page.
          </DialogContentText>
          <Stack spacing={2}>
            <MuiTextField
              select
              label="Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              fullWidth
            >
              {TIERS.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </MuiTextField>
            {tier !== 'master' && (
              <MuiTextField
                label={needsParent ? 'Parent agent ID (required)' : 'Parent agent ID (optional)'}
                value={parentId}
                onChange={(e) => setParentId(e.target.value.replace(/\D/g, ''))}
                helperText={
                  record.sponsor
                    ? `Proposed sponsor: ${record.sponsor.name} (#${record.sponsor.id}, ${record.sponsor.tier})`
                    : 'The parent must be active and of a strictly higher tier'
                }
                error={!valid}
                fullWidth
              />
            )}
            <MuiTextField
              label="Agent contact e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!emailValid}
              helperText="Defaults to the applicant's account e-mail. Must not be used by another agent."
              fullWidth
            />
            <MuiTextField
              label="Commission rate (%)"
              value={commission}
              onChange={(e) => setCommission(e.target.value.replace(/[^\d.]/g, ''))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            color="success"
            variant="contained"
            disabled={loading || !valid}
          >
            {loading ? <CircularProgress size={18} /> : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function ApplicationActions() {
  const record = useRecordContext()
  if (!record) return null
  const open = record.status === 'submitted' || record.status === 'under_review'
  if (!open) return <TopToolbar />

  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status === 'submitted' && (
        <ConfirmActionButton
          label="Take under review"
          icon={ManageSearchIcon}
          confirmText="Mark this application as being reviewed? The applicant will see it in the app."
          onConfirm={() => adminActions.agentApplicationReview(record.id)}
        />
      )}
      <ApproveButton />
      <ReasonActionButton
        label="Reject"
        icon={BlockIcon}
        color="error"
        helperText="The reason is shown to the applicant in the app and recorded in the audit log."
        onConfirm={(reason) => adminActions.agentApplicationReject(record.id, reason)}
      />
    </TopToolbar>
  )
}

export function AgentApplicationShow() {
  return (
    <Show actions={<ApplicationActions />}>
      <ApplicationContent />
    </Show>
  )
}

function ApplicationContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.business_name || 'Agent application'}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Applicant">
              <FunctionField
                render={(r) => r.applicant?.full_name || `User #${r.applicant_user_id}`}
              />
            </Labeled>
            <Labeled label="Email">
              <FunctionField render={(r) => r.applicant?.email || '—'} />
            </Labeled>
            <Labeled label="Account code">
              <FunctionField render={(r) => r.applicant?.code || '—'} />
            </Labeled>
            <Labeled label="Phone">
              <TextField source="phone" emptyText="—" />
            </Labeled>
            <Labeled label="City">
              <TextField source="city" emptyText="—" />
            </Labeled>
            <Labeled label="Region">
              <TextField source="region" emptyText="—" />
            </Labeled>
            <Labeled label="Address">
              <TextField source="address" emptyText="—" />
            </Labeled>
            <Labeled label="Proposed sponsor">
              <FunctionField
                render={(r) =>
                  r.sponsor ? `${r.sponsor.name} — ${r.sponsor.code} (${r.sponsor.tier})` : '—'
                }
              />
            </Labeled>
            <Labeled label="Submitted">
              <DateField source="created_at" showTime />
            </Labeled>
            <Labeled label="Reviewed">
              <DateField source="reviewed_at" showTime emptyText="—" />
            </Labeled>
          </Stack>
          {record.eligibility && (
            <Box sx={{ mt: 3 }}>
              <Labeled label="Balance condition (min. 100 USD or CDF equivalent)">
                <FunctionField
                  render={(r) => {
                    const e = r.eligibility
                    const total = (Number(e.total_usd_equivalent) / 100).toFixed(2)
                    return e.eligible
                      ? `Met — ${total} USD available (USD + CDF)`
                      : `Not met — ${total} USD available, ${(Number(e.shortfall_usd) / 100).toFixed(2)} USD missing`
                  }}
                  sx={{ color: record.eligibility.eligible ? 'success.main' : 'error.main', fontWeight: 600 }}
                />
              </Labeled>
            </Box>
          )}
          <Box sx={{ mt: 3 }}>
            <Labeled label="Motivation">
              <TextField source="motivation" emptyText="—" sx={{ whiteSpace: 'pre-wrap' }} />
            </Labeled>
          </Box>
          {record.rejection_reason && (
            <Box sx={{ mt: 2 }}>
              <Labeled label="Rejection reason">
                <TextField source="rejection_reason" />
              </Labeled>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
