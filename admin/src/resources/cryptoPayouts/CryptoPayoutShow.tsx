import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Show, useRecordContext, TopToolbar } from 'react-admin'
import SendIcon from '@mui/icons-material/SendOutlined'
import BlockIcon from '@mui/icons-material/Block'
import { StatusChip } from '../../components/StatusChip'
import { ReasonActionButton } from '../../components/ActionButtons'
import { adminActions } from '../../providers/dataProvider'
import { AUTO_REASON_LABEL, EXPLORER_TX, formatCents, ISSUE_LABEL, NETWORK_LABEL } from './format'

const TX_HASH = /^0x[0-9a-fA-F]{64}$/

function CryptoPayoutActions() {
  const record = useRecordContext()
  if (!record) return null
  const reviewable =
    record.status === 'pending' || (record.status === 'processing' && record.verification_issue)
  if (!reviewable) return <TopToolbar />
  // The hot wallet is sending it: a manual send too would pay twice. Refusing stays possible.
  const automatic = record.status === 'pending' && record.auto

  const network = NETWORK_LABEL[record.network] ?? record.network
  return (
    <TopToolbar sx={{ gap: 1 }}>
      {!automatic && (
      <ReasonActionButton
        label={record.verification_issue ? 'Correct the hash' : 'Mark as sent'}
        icon={SendIcon}
        color="success"
        inputLabel="Transaction hash (0x…)"
        multiline={false}
        validate={(value) => TX_HASH.test(value.trim())}
        invalidText="0x followed by 64 hexadecimal characters"
        helperText={`Send exactly ${formatCents(record.amount, '').trim()} ${record.token_symbol} on ${network} to ${record.destination_address} from the treasury, then paste the transaction hash. The withdrawal completes only once the chain shows that exact transfer.`}
        onConfirm={(hash) => adminActions.cryptoPayoutSent(record.id, hash)}
      />
      )}
      <ReasonActionButton
        label="Refuse & refund"
        icon={BlockIcon}
        color="error"
        helperText="Only if nothing was sent. The user is refunded in full, fees included; the reason is e-mailed to them and recorded in the audit log."
        onConfirm={(reason) => adminActions.cryptoPayoutReject(record.id, reason)}
      />
    </TopToolbar>
  )
}

export function CryptoPayoutShow() {
  return (
    <Show actions={<CryptoPayoutActions />}>
      <CryptoPayoutContent />
    </Show>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 200, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-all' }}>
        {children}
      </Typography>
    </Stack>
  )
}

function CryptoPayoutContent() {
  const record = useRecordContext()
  if (!record) return null
  const explorer = EXPLORER_TX[record.network]
  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {record.id}
        </Typography>
        <StatusChip status={record.status} />
      </Stack>

      {record.verification_issue && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {ISSUE_LABEL[record.verification_issue] ?? record.verification_issue} Check the
          transaction, then correct the hash — or refuse and refund if nothing left the treasury.
        </Alert>
      )}
      {record.status === 'pending' && record.auto && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Within the automatic limits: the hot wallet sends it within a minute. Do not send it by
          hand — refuse it instead if it must not leave.
        </Alert>
      )}
      {record.status === 'pending' && !record.auto && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {record.auto_reason ? `${AUTO_REASON_LABEL[record.auto_reason] ?? record.auto_reason} ` : ''}
          The user's account is already debited. Send the tokens from the treasury, then mark the
          withdrawal as sent with its transaction hash.
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            To send
          </Typography>
          <Row label="Amount">
            <strong>
              {formatCents(record.amount, '').trim()} {record.token_symbol}
            </strong>
          </Row>
          <Row label="Network">{NETWORK_LABEL[record.network] ?? record.network}</Row>
          <Row label="Destination address">
            <code>{record.destination_address}</code>
          </Row>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Account
          </Typography>
          <Row label="Requested by">
            {record.initiated_by_type} #{record.initiated_by_id}
          </Row>
          <Row label="Fees">{formatCents(record.fee, record.currency_code)}</Row>
          <Row label="Total debited">{formatCents(record.total_debit, record.currency_code)}</Row>
          {record.failure_reason && <Row label="Refusal reason">{record.failure_reason}</Row>}
        </CardContent>
      </Card>

      {record.tx_hash && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              On-chain
            </Typography>
            <Row label="Transaction">
              {explorer ? (
                <Link href={`${explorer}${record.tx_hash}`} target="_blank" rel="noreferrer">
                  {record.tx_hash}
                </Link>
              ) : (
                record.tx_hash
              )}
            </Row>
            <Row label="Confirmations">
              {record.confirmations}
              {record.required_confirmations ? ` / ${record.required_confirmations}` : ''}
            </Row>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
