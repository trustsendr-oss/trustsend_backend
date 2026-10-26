import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CircularProgress from '@mui/material/CircularProgress'
import {
  Show,
  useRecordContext,
  TextField as RaTextField,
  DateField,
  Labeled,
  TopToolbar,
  useGetList,
  useNotify,
  useRefresh,
} from 'react-admin'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import SellOutlinedIcon from '@mui/icons-material/SellOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { API_URL, ApiError } from '../../providers/httpClient'
import { businessKindLabel } from './businessKinds'

function AssignPlanButton({ businessId, currentPlanId }: { businessId: number | string; currentPlanId?: number }) {
  const [open, setOpen] = useState(false)
  const [planId, setPlanId] = useState<number | null>(currentPlanId ?? null)
  const [loading, setLoading] = useState(false)
  const { data: plans, isPending } = useGetList('plans', { filter: { status: 'active' } })
  const notify = useNotify()
  const refresh = useRefresh()

  const handleConfirm = async () => {
    if (!planId) return
    setLoading(true)
    try {
      await adminActions.businessAssignPlan(businessId, planId)
      notify('Plan assigned', { type: 'success' })
      setOpen(false)
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Failed to assign plan', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" startIcon={<SellOutlinedIcon fontSize="small" />} onClick={() => setOpen(true)}>
        Assign plan
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Assign pricing plan</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={plans || []}
            loading={isPending}
            getOptionLabel={(p) => `${p.name} (${p.code})`}
            value={plans?.find((p) => p.id === planId) || null}
            onChange={(_, value) => setPlanId(value?.id ?? null)}
            renderInput={(params) => <TextField {...params} label="Plan" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!planId || loading} onClick={handleConfirm}>
            {loading ? <CircularProgress size={18} /> : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function IssueApiKeyButton({ businessId, disabled }: { businessId: number | string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ key_id: string; api_key: string } | null>(null)
  const notify = useNotify()

  const handleIssue = async () => {
    setLoading(true)
    try {
      const res = await adminActions.businessIssueApiKey(businessId)
      setResult(res)
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Failed to issue key', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setResult(null)
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={disabled}
        startIcon={<VpnKeyOutlinedIcon fontSize="small" />}
        onClick={() => setOpen(true)}
      >
        Issue API key
      </Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Issue a new API key</DialogTitle>
        <DialogContent>
          {!result ? (
            <DialogContentText>
              This generates a new server-to-server API key for this business. It is shown only
              once — copy it before closing this dialog.
            </DialogContentText>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert severity="warning">Store this now — it cannot be retrieved again.</Alert>
              <TextField label="Key ID" value={result.key_id} slotProps={{ input: { readOnly: true } }} fullWidth />
              <TextField
                label="API key"
                value={result.api_key}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <IconButton
                        size="small"
                        onClick={() => navigator.clipboard.writeText(result.api_key)}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    ),
                  },
                }}
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {!result ? (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button variant="contained" onClick={handleIssue} disabled={loading}>
                {loading ? <CircularProgress size={18} /> : 'Generate key'}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  )
}

function RevokeApiKeyButton({ businessId }: { businessId: number | string }) {
  const [open, setOpen] = useState(false)
  const [keyId, setKeyId] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()

  const handleRevoke = async () => {
    if (!keyId.trim()) return
    setLoading(true)
    try {
      await adminActions.businessRevokeApiKey(businessId, keyId.trim())
      notify('API key revoked', { type: 'success' })
      setOpen(false)
      setKeyId('')
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Failed to revoke key', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="small" variant="outlined" color="error" onClick={() => setOpen(true)}>
        Revoke API key
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke API key</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter the key ID to revoke (shown when the key was issued).
          </DialogContentText>
          <TextField autoFocus fullWidth label="Key ID" value={keyId} onChange={(e) => setKeyId(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!keyId.trim() || loading} onClick={handleRevoke}>
            {loading ? <CircularProgress size={18} /> : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function BusinessActions() {
  const record = useRecordContext()
  if (!record) return null

  return (
    <TopToolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
      {record.status === 'pending_approval' && (
        <ConfirmActionButton
          label="Approve"
          icon={CheckCircleOutlineIcon}
          color="success"
          confirmText={`Approve ${record.name}?`}
          onConfirm={() => adminActions.businessApprove(record.id)}
        />
      )}
      {record.status === 'suspended' && (
        <ConfirmActionButton
          label="Reactivate"
          icon={PlayCircleOutlineIcon}
          color="success"
          confirmText={`Reactivate ${record.name}?`}
          onConfirm={() => adminActions.businessActivate(record.id)}
        />
      )}
      {(record.status === 'active' || record.status === 'pending_approval') && (
        <ReasonActionButton
          label="Suspend"
          icon={PauseCircleOutlineIcon}
          color="warning"
          onConfirm={(reason) => adminActions.businessSuspend(record.id, reason)}
        />
      )}
      {record.status !== 'terminated' && (
        <ReasonActionButton
          label="Terminate"
          icon={BlockIcon}
          color="error"
          onConfirm={(reason) => adminActions.businessDeactivate(record.id, reason)}
        />
      )}
      <AssignPlanButton businessId={record.id} currentPlanId={record.plan?.id} />
      <IssueApiKeyButton businessId={record.id} disabled={record.status !== 'active'} />
      <RevokeApiKeyButton businessId={record.id} />
    </TopToolbar>
  )
}

export function BusinessShow() {
  return (
    <Show actions={<BusinessActions />}>
      <BusinessShowContent />
    </Show>
  )
}

/**
 * The institution's logo, as the app shows it. Uploaded here by staff, or by the institution from
 * its own dashboard; PNG, JPEG or WebP up to 1 MB, square works best.
 */
function LogoCard() {
  const record = useRecordContext()
  const notify = useNotify()
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  if (!record) return null

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    try {
      await action()
      notify(done, { type: 'success' })
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Logo update failed', { type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Logo
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              overflow: 'hidden',
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {record.logo_url ? (
              <img
                src={`${API_URL.replace(/\/api\/v1$/, '')}${record.logo_url}`}
                alt={`${record.name} logo`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <Typography variant="caption" color="text.secondary">
                No logo
              </Typography>
            )}
          </Box>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" component="label" disabled={busy}>
                {busy ? <CircularProgress size={16} /> : record.logo_url ? 'Replace logo' : 'Upload logo'}
                <input
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void run(() => adminActions.businessUploadLogo(record.id, file), 'Logo updated')
                  }}
                />
              </Button>
              {record.logo_url ? (
                <Button
                  variant="text"
                  size="small"
                  color="error"
                  disabled={busy}
                  onClick={() => void run(() => adminActions.businessRemoveLogo(record.id), 'Logo removed')}
                >
                  Remove
                </Button>
              ) : null}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              PNG, JPEG or WebP, 1 MB at most. A square image on a light background reads best in the app.
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function BusinessShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.name}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <LogoCard />
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Business ID">
              <RaTextField source="id" />
            </Labeled>
            <Labeled label="Code">
              <RaTextField source="code" />
            </Labeled>
            <Labeled label="Kind">
              {/* What the institution IS. What it may sell is the plan just below — the two are
                  separate on purpose, so an IMF with no lending feature sells no credit. */}
              <Typography variant="body2">{businessKindLabel(record.kind)}</Typography>
            </Labeled>
            <Labeled label="Email">
              <RaTextField source="email" />
            </Labeled>
            <Labeled label="Phone">
              <RaTextField source="phone" emptyText="—" />
            </Labeled>
            <Labeled label="Plan">
              <Typography variant="body2">{record.plan?.name || 'None assigned'}</Typography>
            </Labeled>
            <Labeled label="Webhook URL">
              <RaTextField source="webhook_url" emptyText="—" />
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
    </Box>
  )
}
