import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import type { SvgIconComponent } from '@mui/icons-material'
import { useNotify, useRecordContext, useRefresh } from 'react-admin'
import { ApiError } from '../providers/httpClient'

type Color = 'primary' | 'success' | 'error' | 'warning' | 'inherit'

/** A toolbar button that runs `onConfirm` immediately after a simple yes/no dialog. */
export function ConfirmActionButton({
  label,
  icon: Icon,
  color = 'primary',
  confirmText,
  onConfirm,
}: {
  label: string
  icon: SvgIconComponent
  color?: Color
  confirmText: string
  onConfirm: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const notify = useNotify()
  const refresh = useRefresh()

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
      notify(`${label} — done`, { type: 'success' })
      setOpen(false)
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Action failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="small"
        color={color}
        startIcon={<Icon fontSize="small" />}
        onClick={() => setOpen(true)}
        variant="outlined"
      >
        {label}
      </Button>
      <Dialog open={open} onClose={() => !loading && setOpen(false)}>
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmText}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} color={color} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={18} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** A toolbar button that collects a free-text reason (min 10 chars, mirrors backend validators) before running `onConfirm`. */
export function ReasonActionButton({
  label,
  icon: Icon,
  color = 'error',
  helperText = 'Explain why — this is recorded in the audit log and shown to the affected party.',
  onConfirm,
}: {
  label: string
  icon: SvgIconComponent
  color?: Color
  helperText?: string
  onConfirm: (reason: string) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()
  const refresh = useRefresh()

  const valid = reason.trim().length >= 10

  const handleConfirm = async () => {
    if (!valid) return
    setLoading(true)
    try {
      await onConfirm(reason.trim())
      notify(`${label} — done`, { type: 'success' })
      setOpen(false)
      setReason('')
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Action failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size="small"
        color={color}
        startIcon={<Icon fontSize="small" />}
        onClick={() => setOpen(true)}
        variant="outlined"
      >
        {label}
      </Button>
      <Dialog open={open} onClose={() => !loading && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{label}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>{helperText}</DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reason.length > 0 && !valid}
            helperText={reason.length > 0 && !valid ? 'At least 10 characters' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            color={color}
            variant="contained"
            disabled={loading || !valid}
          >
            {loading ? <CircularProgress size={18} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** Reads the current record from context so action buttons can be dropped straight into a <Show>/<Datagrid> without prop drilling the id. */
export function useCurrentRecordId(): number | string | undefined {
  const record = useRecordContext()
  return record?.id
}
