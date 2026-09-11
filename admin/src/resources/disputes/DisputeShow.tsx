import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import GavelIcon from '@mui/icons-material/GavelOutlined'
import {
  Show,
  useRecordContext,
  TextField as RaTextField,
  DateField,
  Labeled,
  TopToolbar,
  useNotify,
  useRefresh,
} from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { adminActions } from '../../providers/dataProvider'
import { ApiError } from '../../providers/httpClient'

function CloseDisputeButton({ disputeId }: { disputeId: number | string }) {
  const [open, setOpen] = useState(false)
  const [outcome, setOutcome] = useState<'approved' | 'rejected'>('approved')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()
  const refresh = useRefresh()

  const valid = notes.trim().length >= 10

  const handleClose = async () => {
    if (!valid) return
    setLoading(true)
    try {
      await adminActions.disputeClose(disputeId, outcome, notes.trim())
      notify('Dispute closed', { type: 'success' })
      setOpen(false)
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Failed to close dispute', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<GavelIcon fontSize="small" />} onClick={() => setOpen(true)}>
        Close dispute
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Close dispute</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Approving reverses the disputed transaction; rejecting leaves it as-is. Both outcomes
            are final.
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={outcome}
            onChange={(_, value) => value && setOutcome(value)}
            sx={{ mb: 2 }}
            fullWidth
          >
            <ToggleButton value="approved" color="success">
              Approve (reverse transaction)
            </ToggleButton>
            <ToggleButton value="rejected" color="error">
              Reject
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Resolution notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={notes.length > 0 && !valid}
            helperText={notes.length > 0 && !valid ? 'At least 10 characters' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!valid || loading} onClick={handleClose}>
            {loading ? <CircularProgress size={18} /> : 'Close dispute'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function DisputeActions() {
  const record = useRecordContext()
  if (!record) return null
  const closable = record.status !== 'resolved' && record.status !== 'rejected'
  return <TopToolbar>{closable && <CloseDisputeButton disputeId={record.id} />}</TopToolbar>
}

export function DisputeShow() {
  return (
    <Show actions={<DisputeActions />}>
      <DisputeShowContent />
    </Show>
  )
}

function DisputeShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Dispute #{record.id}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4, mb: 2 }}>
            <Labeled label="Transaction">
              <RaTextField source="ledger_transaction_id" />
            </Labeled>
            <Labeled label="Raised by">
              <Typography variant="body2">
                {record.raised_by_type} #{record.raised_by_id}
              </Typography>
            </Labeled>
            <Labeled label="Opened">
              <DateField source="opened_at" showTime />
            </Labeled>
            <Labeled label="Resolved">
              <DateField source="resolved_at" showTime emptyText="—" />
            </Labeled>
          </Stack>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Reason
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {record.reason}
          </Typography>
          {record.resolution_notes && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Resolution notes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {record.resolution_notes}
              </Typography>
            </>
          )}
        </CardContent>
      </Card>

      <DisputeThread disputeId={record.id} status={record.status} />
    </Box>
  )
}

/** Deux états à ne pas confondre : le client a renoncé, ou le support a tranché. */
const CLOSED_STATUSES = ['approved', 'rejected', 'resolved', 'withdrawn']

/**
 * Fil de discussion avec le réclamant.
 *
 * Chargé ici plutôt que par le dataProvider standard : ce n'est pas une ressource react-admin,
 * juste une sous-collection d'un dossier — lui inventer une ressource pour ce seul usage
 * ajouterait une entrée au menu que personne n'ouvrirait.
 */
function DisputeThread({
  disputeId,
  status,
}: {
  disputeId: number | string
  status: string
}) {
  const [messages, setMessages] = useState<
    Array<{ id: number; mine: boolean; body: string; created_at: string }>
  >([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notify = useNotify()

  const load = useCallback(async () => {
    try {
      setMessages(await adminActions.disputeMessages(disputeId))
    } catch {
      // Un fil illisible ne doit pas empêcher de consulter le dossier lui-même.
    }
  }, [disputeId])

  useEffect(() => {
    void load()
  }, [load])

  const closed = CLOSED_STATUSES.includes(status)

  async function send() {
    const body = draft.trim()
    if (body.length < 2) return
    setSending(true)
    setError(null)
    try {
      await adminActions.disputeReply(disputeId, body)
      setDraft('')
      await load()
      notify('Reply sent — the customer is notified in the app', { type: 'info' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
          Conversation
        </Typography>

        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No messages yet.
          </Typography>
        )}

        <Stack spacing={1.5} sx={{ mb: messages.length ? 2 : 0 }}>
          {messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                alignSelf: message.mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                bgcolor: message.mine ? 'primary.main' : 'action.hover',
                color: message.mine ? 'primary.contrastText' : 'text.primary',
              }}
            >
              <Typography variant="body2">{message.body}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {message.mine ? 'Support' : 'Customer'} ·{' '}
                {new Date(message.created_at).toLocaleString()}
              </Typography>
            </Box>
          ))}
        </Stack>

        {closed ? (
          <Typography variant="body2" color="text.secondary">
            This dispute is closed — the customer can no longer reply. Reopening
            a settled discussion requires a new dispute.
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              placeholder="Reply to the customer…"
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
              error={!!error}
              helperText={error ?? `${draft.trim().length}/2000`}
            />
            <Button
              variant="contained"
              disabled={draft.trim().length < 2 || sending}
              onClick={() => void send()}
              sx={{ mt: 0.5 }}
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
