import { List, Datagrid, TextField, DateField, FunctionField, SelectInput, SearchInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'
import { formatAmount } from './format'

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Reference, name, phone…" />,
  <SelectInput
    key="status"
    source="status"
    alwaysOn
    choices={[
      { id: 'held', name: 'Held (compliance)' },
      { id: 'awaiting_payout', name: 'Awaiting payout' },
      { id: 'processing', name: 'Processing (mobile money)' },
      { id: 'paid', name: 'Paid' },
      { id: 'cancelled', name: 'Cancelled' },
      { id: 'expired', name: 'Expired' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'failed', name: 'Failed (refunded)' },
    ]}
  />,
]

/** International transfers into the DRC; the default view is the compliance hold queue. */
export function RemittanceList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'held' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" label="Reference" />
        <FunctionField label="Sender" render={(r) => `${r.sender_name} (${r.sender_country})`} />
        <TextField source="beneficiary_name" label="Beneficiary" />
        <FunctionField label="Sent" render={(r) => formatAmount(r.send_amount, r.source_currency)} />
        <FunctionField
          label="Payout"
          render={(r) => formatAmount(r.payout_amount, r.payout_currency)}
        />
        <FunctionField
          label="Method"
          render={(r) =>
            r.payout_method === 'cash_pickup'
              ? 'Cash pickup'
              : r.payout_method === 'mobile_money'
                ? `Mobile money (${r.payout_provider_code ?? '—'})`
                : 'Wallet'
          }
        />
        <StatusField source="status" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  )
}
