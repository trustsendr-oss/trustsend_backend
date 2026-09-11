import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableBody from '@mui/material/TableBody'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import MuiTextField from '@mui/material/TextField'
import CircularProgress from '@mui/material/CircularProgress'
import { Show, useRecordContext, TextField, DateField, Labeled, TopToolbar, Link, useNotify, useRefresh } from 'react-admin'
import AcUnitIcon from '@mui/icons-material/AcUnitOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import BlockIcon from '@mui/icons-material/Block'
import AddCardIcon from '@mui/icons-material/AddCardOutlined'
import { StatusChip } from '../../components/StatusChip'
import { MoneyField } from '../../components/MoneyField'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { ApiError } from '../../providers/httpClient'

interface CardOwner {
  type: 'user' | 'business'
  id: number
  code: string | null
  full_name?: string | null
  name?: string | null
  email: string
  phone?: string | null
  status?: string
  created_at: string
}

interface CardTransaction {
  transactionId: string
  amount: string
  description: string
  createdAt: string
}

/** Moves money from the card's funding wallet onto the card, same as the cardholder's own
 * top-up — but admin-initiated, so no cardholder PIN is collected (see cards_controller.ts topup()). */
function TopupButton() {
  const record = useRecordContext()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const notify = useNotify()
  const refresh = useRefresh()
  if (!record) return null

  const cents = Math.round(parseFloat(amount) * 100)
  const valid = amount.trim() !== '' && Number.isFinite(cents) && cents > 0

  const handleClose = () => {
    if (loading) return
    setOpen(false)
    setAmount('')
  }

  const handleConfirm = async () => {
    if (!valid) return
    setLoading(true)
    try {
      await adminActions.cardTopup(record.id, String(cents))
      notify('Card topped up', { type: 'success' })
      setOpen(false)
      setAmount('')
      refresh()
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Top-up failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="small" color="primary" variant="outlined" startIcon={<AddCardIcon fontSize="small" />} onClick={() => setOpen(true)}>
        Top up
      </Button>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle>Top up card</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Debits wallet #{record.wallet_id} and credits this card, exactly like the cardholder's own top-up.
          </DialogContentText>
          <MuiTextField
            autoFocus
            fullWidth
            type="number"
            label={`Amount (${record.currency_code})`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} variant="contained" disabled={loading || !valid}>
            {loading ? <CircularProgress size={18} /> : 'Top up'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function CardActions() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <TopToolbar sx={{ gap: 1 }}>
      {record.status === 'active' && <TopupButton />}
      {record.status === 'active' && (
        <ReasonActionButton
          label="Freeze"
          icon={AcUnitIcon}
          color="warning"
          helperText="Freezes the card immediately at the provider. Reason kept for your own records."
          onConfirm={async () => adminActions.cardFreeze(record.id)}
        />
      )}
      {record.status === 'frozen' && (
        <ConfirmActionButton
          label="Unfreeze"
          icon={PlayCircleOutlineIcon}
          color="success"
          confirmText="Unfreeze this card and let it be used again?"
          onConfirm={() => adminActions.cardUnfreeze(record.id)}
        />
      )}
      {record.status !== 'terminated' && (
        <ReasonActionButton
          label="Terminate"
          icon={BlockIcon}
          color="error"
          helperText="Permanently terminates the card at the provider and withdraws any remaining balance back to the funding wallet. This cannot be undone."
          onConfirm={(reason) => adminActions.cardTerminate(record.id, reason)}
        />
      )}
    </TopToolbar>
  )
}

function TransactionsCard() {
  const record = useRecordContext()
  const [transactions, setTransactions] = useState<CardTransaction[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!record) return
    let cancelled = false
    setTransactions(null)
    setError(null)
    adminActions
      .cardTransactions(record.id)
      .then((data) => {
        if (!cancelled) setTransactions(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load transactions')
      })
    return () => {
      cancelled = true
    }
  }, [record?.id])

  if (!record) return null

  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Transactions (last 90 days)
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : transactions === null ? (
          <Stack direction="row" sx={{ justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : transactions.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No transactions in this period.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Transaction</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.transactionId}>
                  <TableCell>{t.transactionId}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {record.currency_code} {t.amount}
                  </TableCell>
                  <TableCell>{t.description || '—'}</TableCell>
                  <TableCell>{t.createdAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function OwnerCard() {
  const record = useRecordContext()
  const owner: CardOwner | undefined = record?.owner
  if (!owner) return null
  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Owner
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
          <Labeled label={owner.type === 'user' ? 'User' : 'Business'}>
            <Typography variant="body2">
              <Link to={`/${owner.type === 'user' ? 'users' : 'businesses'}/${owner.id}/show`}>
                {owner.full_name || owner.name || `#${owner.id}`}
              </Link>
            </Typography>
          </Labeled>
          <Labeled label="Code">
            <Typography variant="body2">{owner.code || '—'}</Typography>
          </Labeled>
          <Labeled label="Email">
            <Typography variant="body2">{owner.email}</Typography>
          </Labeled>
          {owner.type === 'business' && (
            <>
              <Labeled label="Phone">
                <Typography variant="body2">{owner.phone || '—'}</Typography>
              </Labeled>
              <Labeled label="Status">
                <StatusChip status={owner.status!} />
              </Labeled>
            </>
          )}
          <Labeled label="Member since">
            <DateField record={owner} source="created_at" showTime />
          </Labeled>
        </Stack>
      </CardContent>
    </Card>
  )
}

export function CardShow() {
  return (
    <Show actions={<CardActions />}>
      <CardShowContent />
    </Show>
  )
}

function CardShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.masked || `Card #${record.id}`}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Card ID">
              <TextField source="id" />
            </Labeled>
            <Labeled label="Wallet ID">
              <TextField source="wallet_id" />
            </Labeled>
            <Labeled label="Provider">
              <TextField source="provider" />
            </Labeled>
            <Labeled label="Brand">
              <TextField source="brand" />
            </Labeled>
            <Labeled label="Type">
              <TextField source="card_type" />
            </Labeled>
            <Labeled label="Currency">
              <TextField source="currency_code" />
            </Labeled>
            <Labeled label="Balance">
              <MoneyField source="balance" currencySource="currency_code" />
            </Labeled>
            <Labeled label="First 6 / Last 4">
              <Typography variant="body2">
                {record.first_six || '—'} / {record.last_four || '—'}
              </Typography>
            </Labeled>
            {record.failure_reason && (
              <Labeled label="Failure reason">
                <TextField source="failure_reason" />
              </Labeled>
            )}
            <Labeled label="Created">
              <DateField source="created_at" showTime />
            </Labeled>
            <Labeled label="Last updated">
              <DateField source="updated_at" showTime emptyText="—" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
      <OwnerCard />
      <TransactionsCard />
    </Box>
  )
}
