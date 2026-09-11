import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SelectInput
    source="status"
    alwaysOn
    choices={[
      { id: 'opened', name: 'Opened' },
      { id: 'investigating', name: 'Investigating' },
      { id: 'approved', name: 'Approved' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'resolved', name: 'Resolved' },
    ]}
  />,
  <SelectInput
    source="raised_by_type"
    label="Raised by"
    choices={[
      { id: 'user', name: 'User' },
      { id: 'agent', name: 'Agent' },
      { id: 'internal_user', name: 'Internal user' },
    ]}
  />,
]

export function DisputeList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'opened' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="ledger_transaction_id" label="Transaction" />
        <FunctionField label="Raised by" render={(r) => `${r.raised_by_type} #${r.raised_by_id}`} />
        <TextField source="reason" />
        <StatusField source="status" />
        <DateField source="opened_at" showTime />
      </Datagrid>
    </List>
  )
}
