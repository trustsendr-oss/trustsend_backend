import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Show, SimpleShowLayout, TextField, DateField, FunctionField, useRecordContext } from 'react-admin'
import { StatusField } from '../../components/StatusChip'

/**
 * A loan in full: its terms, its schedule, and where every payment went.
 *
 * There is no approve or reject button, on purpose. Whether a borrower gets credit is the
 * institution's decision, taken by its own credit officer under its own policy — TumaPlus operates
 * the system and answers for the money moving correctly, not for who deserves a loan. A button
 * here would quietly move that judgement, and the liability with it, to the wrong party.
 */
function DecisionNotice() {
  const record = useRecordContext()
  if (!record) return null

  if (record.status === 'rejected' && record.decision_notes) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Refused by the institution — {record.decision_notes}
      </Alert>
    )
  }
  if (record.status === 'defaulted') {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        Written off as defaulted. Nothing was forgiven: {record.total_outstanding}{' '}
        {record.currency_code} is still owed and recovery remains possible.
      </Alert>
    )
  }
  return null
}

function Schedule() {
  const record = useRecordContext()
  const lines = (record?.schedule ?? []) as any[]
  if (lines.length === 0) return null

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          Repayment schedule
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Due</TableCell>
              <TableCell align="right">Principal</TableCell>
              <TableCell align="right">Interest</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Remaining</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line) => (
              <TableRow
                key={line.installment}
                // Late and unmet: the lines a field officer is actually looking for.
                sx={line.overdue ? { bgcolor: 'error.light' } : undefined}
              >
                <TableCell>{line.installment}</TableCell>
                <TableCell>{new Date(line.due_at).toLocaleDateString()}</TableCell>
                <TableCell align="right">{line.principal}</TableCell>
                <TableCell align="right">{line.interest}</TableCell>
                <TableCell align="right">{line.total}</TableCell>
                <TableCell align="right">{line.paid}</TableCell>
                <TableCell align="right">{line.remaining}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** Where each payment went, as recorded at the time — never re-derived from today's rule. */
function Repayments() {
  const record = useRecordContext()
  const payments = (record?.repayments ?? []) as any[]
  if (payments.length === 0) return null

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          Payments received
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Paid</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right">Penalties</TableCell>
              <TableCell align="right">Interest</TableCell>
              <TableCell align="right">Principal</TableCell>
              <TableCell>Ledger</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>{new Date(payment.paid_at).toLocaleString()}</TableCell>
                <TableCell align="right">{payment.amount}</TableCell>
                <TableCell align="right">{payment.applied_to_penalties}</TableCell>
                <TableCell align="right">{payment.applied_to_interest}</TableCell>
                <TableCell align="right">{payment.applied_to_principal}</TableCell>
                <TableCell>{payment.ledger_transaction_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Penalties() {
  const record = useRecordContext()
  const charges = (record?.penalties ?? []) as any[]
  if (charges.length === 0) return null

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          Late charges
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Period</TableCell>
              <TableCell align="right">Days late</TableCell>
              <TableCell align="right">Charged on</TableCell>
              <TableCell align="right">Rate</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {charges.map((charge) => (
              <TableRow key={charge.period_key}>
                <TableCell>{charge.period_key}</TableCell>
                <TableCell align="right">{charge.days_overdue}</TableCell>
                <TableCell align="right">{charge.basis_amount}</TableCell>
                <TableCell align="right">{charge.rate_bps / 100}%</TableCell>
                <TableCell align="right">{charge.amount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function LoanShow() {
  return (
    <Show>
      <Box sx={{ p: 2 }}>
        <DecisionNotice />
      </Box>
      <SimpleShowLayout>
        <TextField source="borrower_name" label="Borrower" />
        <TextField source="borrower_code" label="Account code" emptyText="—" />
        <TextField source="provider_name" label="Institution" />
        <TextField source="product_name" label="Product" emptyText="—" />
        <StatusField source="status" />
        <FunctionField
          label="Principal"
          render={(r: any) => `${r.principal} ${r.currency_code}`}
        />
        <FunctionField
          label="Still owed"
          render={(r: any) =>
            `${r.total_outstanding} (principal ${r.principal_outstanding}, interest ${r.interest_outstanding}, penalties ${r.penalties_outstanding})`
          }
        />
        <FunctionField
          label="Interest"
          render={(r: any) =>
            `${r.interest_rate_percent}% per ${r.interest_period} — ${
              r.interest_method === 'flat'
                ? 'flat, on the original principal'
                : 'declining, on the balance outstanding'
            }`
          }
        />
        <FunctionField
          label="Late charge"
          render={(r: any) =>
            r.penalty_rate_percent === null
              ? 'None'
              : `${r.penalty_rate_percent}% on the ${
                  r.penalty_basis === 'overdue_amount' ? 'overdue amount' : 'outstanding principal'
                }`
          }
        />
        <TextField source="fees_charged" label="Arrangement fee" />
        <DateField source="requested_at" label="Applied" showTime />
        <DateField source="decided_at" label="Decided" showTime emptyText="—" />
        <DateField source="disbursed_at" label="Disbursed" showTime emptyText="—" />
        <TextField source="disbursement_transaction_id" label="Disbursement ledger id" emptyText="—" />
      </SimpleShowLayout>
      <Stack sx={{ px: 2, pb: 2 }}>
        <Schedule />
        <Repayments />
        <Penalties />
      </Stack>
    </Show>
  )
}
