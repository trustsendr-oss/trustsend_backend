import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SelectInput
    source="status"
    alwaysOn
    choices={[
      { id: 'pending', name: 'Pending' },
      { id: 'in_review', name: 'In review' },
      { id: 'approved', name: 'Approved' },
      { id: 'rejected', name: 'Rejected' },
      { id: 'expired', name: 'Expired' },
      { id: 'not_started', name: 'Not started' },
    ]}
  />,
  <SelectInput
    source="subject_type"
    choices={[
      { id: 'user', name: 'User' },
      { id: 'agent', name: 'Agent' },
      { id: 'business', name: 'Business' },
    ]}
  />,
]

export function KycList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'pending' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <FunctionField
          label="Subject"
          render={(r) => `${r.subject_type} #${r.subject_id}`}
        />
        <TextField source="verification_type" label="Type" />
        <StatusField source="status" />
        <DateField source="submitted_at" showTime emptyText="—" />
        <DateField source="decided_at" showTime emptyText="—" />
      </Datagrid>
    </List>
  )
}
