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
import { Show, useRecordContext, TextField, Labeled } from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { MoneyField, formatMoney } from '../../components/MoneyField'

interface RecentEntry {
  id: string
  ledger_transaction_id: string
  direction: 'debit' | 'credit'
  amount: string
  balance_after: string
  created_at: string
}

function RecentEntriesCard() {
  const record = useRecordContext()
  const entries: RecentEntry[] = record?.recent_entries || []
  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Recent entries
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No entries yet.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Transaction</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Balance after</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.ledger_transaction_id}</TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{e.direction}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(e.amount, record?.currency_code)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(e.balance_after, record?.currency_code)}
                  </TableCell>
                  <TableCell>{e.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function LedgerAccountShow() {
  return (
    <Show>
      <LedgerAccountShowContent />
    </Show>
  )
}

function LedgerAccountShowContent() {
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
      <Card>
        <CardContent>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
            <Labeled label="Code">
              <TextField source="code" />
            </Labeled>
            <Labeled label="Account type">
              <TextField source="account_type" />
            </Labeled>
            <Labeled label="Owner">
              <Typography variant="body2">
                {record.owner_type}
                {record.owner_id ? ` #${record.owner_id}` : ''}
              </Typography>
            </Labeled>
            <Labeled label="Balance">
              <MoneyField source="balance" currencySource="currency_code" />
            </Labeled>
          </Stack>
        </CardContent>
      </Card>
      <RecentEntriesCard />
    </Box>
  )
}
