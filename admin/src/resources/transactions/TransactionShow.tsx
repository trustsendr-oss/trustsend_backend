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
import Divider from '@mui/material/Divider'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreOutlined'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined'
import UndoIcon from '@mui/icons-material/UndoOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Show, useRecordContext, DateField, Link } from 'react-admin'
import { StatusChip } from '../../components/StatusChip'
import { formatMoney, MoneyField } from '../../components/MoneyField'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mobile_money: 'Mobile money',
  card: 'Card',
  cash_agent: 'Cash (agent)',
  wallet: 'Wallet',
  float_transfer: 'Float transfer',
}

/** Small uppercase eyebrow label — same pattern as the sidebar's section headers (AppMenu.tsx). */
function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ fontWeight: 700, letterSpacing: 1, display: 'block', mb: 1 }}
    >
      {children}
    </Typography>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {children}
      </Typography>
    </Box>
  )
}

interface LedgerEntryRow {
  id: string
  account_code: string | null
  account_name: string | null
  owner_type: string | null
  owner_id: number | null
  direction: 'debit' | 'credit'
  amount: string
  currency_code: string
  balance_after: string
}

function DisputeBanner() {
  const record = useRecordContext()
  const dispute = record?.dispute
  if (!dispute) return null
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      This transaction has a linked dispute (#{dispute.id}, status: {dispute.status}) —{' '}
      <Link to={`/disputes/${dispute.id}/show`}>view it</Link>.
    </Alert>
  )
}

function FailureReasonBanner() {
  const record = useRecordContext()
  if (!record?.failure_reason) return null
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {record.failure_reason}
    </Alert>
  )
}

/** The mobile money "tracking" row and its "posted" double-entry counterpart are two separate
 * transactions linked only by related_transaction_id — see mobile_money_deposit_service.ts
 * confirmFromCallback(). Surfacing the link here is the whole point: without it, an admin sees
 * what looks like two unrelated transactions for one real-world deposit/payout. */
function RelatedTransactionBanner() {
  const record = useRecordContext()
  const related = record?.related_transaction
  if (!related) return null
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      Linked to transaction <Link to={`/transactions/${related.id}/show`}>{related.id}</Link> (
      {related.type}, {related.status}).
    </Alert>
  )
}

function OverviewCard() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 4 }}>
          <Field label="Type">{record.type}</Field>
          <Field label="Amount">
            {record.amount ? <MoneyField source="amount" currencySource="currency_code" /> : '—'}
          </Field>
          <Field label="Payment method">
            {record.payment_method ? (
              <>
                {PAYMENT_METHOD_LABELS[record.payment_method] || record.payment_method}
                {record.payment_channel && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                    ({record.payment_channel})
                  </Typography>
                )}
              </>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Initiated by">
            {record.initiated_by_name}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
              ({record.initiated_by_type} #{record.initiated_by_id})
            </Typography>
          </Field>
          <Field label="Provider">{record.provider || '—'}</Field>
          {record.counterparty_phone && <Field label="Phone">{record.counterparty_phone}</Field>}
          {record.fee && record.fee !== '0' && (
            <Field label="Fee">
              <MoneyField source="fee" currencySource="currency_code" />
            </Field>
          )}
        </Stack>
        {record.description && (
          <>
            <Divider sx={{ my: 2 }} />
            <Field label="Description">{record.description}</Field>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TimelineStep({
  label,
  date,
  state,
}: {
  label: string
  date: string | null
  state: 'done' | 'pending' | 'reversed'
}) {
  const Icon = state === 'done' ? CheckCircleIcon : state === 'reversed' ? UndoIcon : RadioButtonUncheckedIcon
  const color = state === 'done' ? 'success.main' : state === 'reversed' ? 'error.main' : 'text.disabled'
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', flex: '1 1 160px' }}>
      <Icon sx={{ color, fontSize: 20, mt: 0.25 }} />
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {date ? (
          <DateField record={{ date }} source="date" showTime sx={{ fontSize: 13 }} />
        ) : (
          <Typography variant="caption" color="text.disabled">
            Not yet
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

function TimelineCard() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <SectionLabel>Timeline</SectionLabel>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3 }}>
          <TimelineStep label="Created" date={record.created_at} state="done" />
          <TimelineStep
            label="Completed"
            date={record.completed_at}
            state={record.completed_at ? 'done' : 'pending'}
          />
          {record.reversed_at && (
            <TimelineStep label="Reversed" date={record.reversed_at} state="reversed" />
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function EntriesCard() {
  const record = useRecordContext()
  const entries: LedgerEntryRow[] = record?.entries || []
  return (
    <Card sx={{ mt: 2 }}>
      <CardHeader
        title={
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Ledger entries
          </Typography>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No ledger entries.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Balance after</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Typography variant="body2">{e.account_name || e.account_code}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {e.account_code}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {e.owner_type ? `${e.owner_type}${e.owner_id ? ` #${e.owner_id}` : ''}` : '—'}
                  </TableCell>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{e.direction}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(e.amount, e.currency_code)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(e.balance_after, e.currency_code)}
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

/** Correlation id / idempotency key / provider reference / reversal-of — needed for debugging a
 * specific issue, not for a normal review, so they stay one click away instead of competing with
 * the fields above for attention. */
function TechnicalDetailsAccordion() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Accordion sx={{ mt: 2, '&:before': { display: 'none' } }} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          Technical details
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3 }}>
          <Field label="Correlation ID">
            <code>{record.correlation_id}</code>
          </Field>
          <Field label="Idempotency key">
            <code>{record.idempotency_key || '—'}</code>
          </Field>
          <Field label="Provider reference">{record.provider_reference_id || '—'}</Field>
          <Field label="Reversal of">{record.reversal_of_transaction_id || '—'}</Field>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

export function TransactionShow() {
  return (
    <Show>
      <TransactionShowContent />
    </Show>
  )
}

function TransactionShowContent() {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.id}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>

      <FailureReasonBanner />
      <DisputeBanner />
      <RelatedTransactionBanner />
      <OverviewCard />
      <TimelineCard />
      <EntriesCard />
      <TechnicalDetailsAccordion />
    </Box>
  )
}
