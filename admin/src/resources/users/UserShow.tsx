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
import LockResetIcon from '@mui/icons-material/LockResetOutlined'
import AcUnitIcon from '@mui/icons-material/AcUnitOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import { Show, useRecordContext, Labeled, TextField, DateField, TopToolbar } from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { ConfirmActionButton, ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { formatMoney } from '../../components/MoneyField'

interface Wallet {
  id: number
  currency_code: string
  balance: string
  status: string
}

function UserActions() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <TopToolbar>
      <ReasonActionButton
        label="Reset PIN"
        icon={LockResetIcon}
        color="warning"
        helperText="Clears the user's PIN — they must set a new one from the app on next login. This does not require a reason server-side but keep a note here for your own records."
        onConfirm={async () => adminActions.userResetPin(record.id)}
      />
    </TopToolbar>
  )
}

function WalletsCard() {
  const record = useRecordContext()
  const wallets: Wallet[] = record?.wallets || []
  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Wallets</Typography>} />
      <CardContent sx={{ pt: 0 }}>
        {wallets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No wallets.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Currency</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{w.id}</TableCell>
                  <TableCell>{w.currency_code}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(w.balance, w.currency_code)}
                  </TableCell>
                  <TableCell>
                    <StatusChip status={w.status} />
                  </TableCell>
                  <TableCell align="right">
                    {record && w.status === 'frozen' ? (
                      <ConfirmActionButton
                        label="Unfreeze"
                        icon={PlayCircleOutlineIcon}
                        color="success"
                        confirmText={`Unfreeze wallet #${w.id}?`}
                        onConfirm={() => adminActions.userUnfreezeWallet(record.id, w.id)}
                      />
                    ) : (
                      record && (
                        <ReasonActionButton
                          label="Freeze"
                          icon={AcUnitIcon}
                          color="error"
                          onConfirm={(reason) => adminActions.userFreezeWallet(record.id, w.id, reason)}
                        />
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function KycCard() {
  const record = useRecordContext()
  const kyc = record?.kyc
  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Latest KYC</Typography>} />
      <CardContent sx={{ pt: 0 }}>
        {!kyc ? (
          <Typography variant="body2" color="text.secondary">
            No KYC verification on file.
          </Typography>
        ) : (
          <Stack direction="row" spacing={4} sx={{ alignItems: 'center' }}>
            <StatusChip status={kyc.status} />
            <Typography variant="body2">{kyc.verification_type}</Typography>
            {kyc.decided_at && (
              <Typography variant="body2" color="text.secondary">
                Decided {kyc.decided_at}
              </Typography>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

export function UserShow() {
  return (
    <Show actions={<UserActions />}>
      <UserShowContent />
    </Show>
  )
}

function UserShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>
        {record.full_name}
      </Typography>
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="User ID">
              <TextField source="id" />
            </Labeled>
            <Labeled label="Code">
              <TextField source="code" emptyText="—" />
            </Labeled>
            <Labeled label="Email">
              <TextField source="email" />
            </Labeled>
            <Labeled label="Failed login attempts">
              <TextField source="login_attempts" />
            </Labeled>
            <Labeled label="Created">
              <DateField source="created_at" showTime />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
      <WalletsCard />
      <KycCard />
    </Box>
  )
}
