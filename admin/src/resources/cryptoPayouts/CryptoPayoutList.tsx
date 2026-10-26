import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'
import { formatCents, NETWORK_LABEL } from './format'
import { TreasuryPanel } from './TreasuryPanel'

const filters = [
  <SelectInput
    key="status"
    source="status"
    alwaysOn
    choices={[
      { id: 'pending', name: 'To review and send' },
      { id: 'attention', name: 'Needs attention (chain mismatch)' },
      { id: 'processing', name: 'Sent, confirming on-chain' },
      { id: 'completed', name: 'Completed' },
      { id: 'failed', name: 'Refused (refunded)' },
    ]}
  />,
]

/**
 * Crypto withdrawals, reviewed and sent by staff from the treasury (phase 1). The default view is
 * the queue of withdrawals waiting to be sent.
 */
export function CryptoPayoutList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'pending' }} perPage={25}>
      {/* What the treasury can send right now, next to what is waiting. */}
      <TreasuryPanel />
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="Reference" />
        <FunctionField label="Amount to send" render={(r) => `${formatCents(r.amount, '').trim()} ${r.token_symbol}`} />
        <FunctionField label="Network" render={(r) => NETWORK_LABEL[r.network] ?? r.network} />
        <FunctionField
          label="Destination"
          render={(r) => `${String(r.destination_address).slice(0, 8)}…${String(r.destination_address).slice(-6)}`}
        />
        <FunctionField label="User" render={(r) => `${r.initiated_by_type} #${r.initiated_by_id}`} />
        <StatusField source="status" />
        <DateField source="created_at" label="Requested" showTime />
      </Datagrid>
    </List>
  )
}
