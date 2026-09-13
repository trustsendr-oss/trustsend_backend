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
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CircularProgress from '@mui/material/CircularProgress'
import PasswordIcon from '@mui/icons-material/PasswordOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import SecurityIcon from '@mui/icons-material/SecurityOutlined'
import {
  Show,
  useRecordContext,
  TextField as RaTextField,
  BooleanField,
  DateField,
  Labeled,
  TopToolbar,
  useGetIdentity,
  useNotify,
} from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { ApiError } from '../../providers/httpClient'

function ResetPasswordButton({ userId }: { userId: number | string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const notify = useNotify()

  const handleReset = async () => {
    setLoading(true)
    try {
      const res = await adminActions.internalUserResetPassword(userId)
      setPassword(res.new_password)
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Failed to reset password', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setOpen(false)
    setPassword(null)
  }

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PasswordIcon fontSize="small" />}
        onClick={() => setOpen(true)}
      >
        Reset password
      </Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          {!password ? (
            <DialogContentText>
              Generates a new temporary password for this staff account. It must be changed on
              next login, and is shown only once here.
            </DialogContentText>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Alert severity="warning">Store this now — it cannot be retrieved again.</Alert>
              <TextField
                label="New password"
                value={password}
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <IconButton size="small" onClick={() => navigator.clipboard.writeText(password)}>
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
          {!password ? (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button variant="contained" onClick={handleReset} disabled={loading}>
                {loading ? <CircularProgress size={18} /> : 'Generate'}
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

function InternalUserActions() {
  const record = useRecordContext()
  const { data: identity } = useGetIdentity()
  if (!record) return null
  const isSelf = identity?.id === record.id

  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status !== 'active' && (
        <ConfirmActionButton
          label="Activate"
          icon={PlayCircleOutlineIcon}
          color="success"
          confirmText={`Activate ${record.full_name}?`}
          onConfirm={() => adminActions.internalUserActivate(record.id)}
        />
      )}
      {record.status === 'active' && !isSelf && (
        <ReasonActionButton
          label="Suspend"
          icon={PauseCircleOutlineIcon}
          color="warning"
          onConfirm={(reason) => adminActions.internalUserSuspend(record.id, reason)}
        />
      )}
      {record.status !== 'inactive' && !isSelf && (
        <ReasonActionButton
          label="Deactivate"
          icon={BlockIcon}
          color="error"
          onConfirm={(reason) => adminActions.internalUserDeactivate(record.id, reason)}
        />
      )}
      <ResetPasswordButton userId={record.id} />
      {record.mfa_enabled && !isSelf && (
        <ConfirmActionButton
          label="Reset 2FA"
          icon={SecurityIcon}
          color="warning"
          confirmText={`Reset two-factor authentication for ${record.full_name}? Their sessions are ended and they must enrol a new authenticator on next sign-in.`}
          onConfirm={() => adminActions.internalUserResetMfa(record.id)}
        />
      )}
      {isSelf && (
        <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center', ml: 1 }}>
          You can't suspend, deactivate or reset 2FA on your own account
        </Typography>
      )}
    </TopToolbar>
  )
}

export function InternalUserShow() {
  return (
    <Show actions={<InternalUserActions />}>
      <InternalUserShowContent />
    </Show>
  )
}

function InternalUserShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.full_name}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Staff ID">
              <RaTextField source="id" />
            </Labeled>
            <Labeled label="Email">
              <RaTextField source="email" />
            </Labeled>
            <Labeled label="Must change password">
              <BooleanField source="must_change_password" />
            </Labeled>
            <Labeled label="MFA enabled">
              <BooleanField source="mfa_enabled" />
            </Labeled>
            <Labeled label="Created">
              <DateField source="created_at" showTime />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
