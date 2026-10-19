import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SelectInput
    key="status"
    source="status"
    alwaysOn
    choices={[
      { id: 'submitted', name: 'Submitted' },
      { id: 'under_review', name: 'Under review' },
      { id: 'approved', name: 'Approved' },
      { id: 'rejected', name: 'Rejected' },
    ]}
  />,
]

/** "Become an agent" requests sent from the mobile app, newest first. */
export function AgentApplicationList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'submitted' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <FunctionField
          label="Applicant"
          render={(r) => r.applicant?.full_name || r.applicant?.email || `User #${r.applicant_user_id}`}
        />
        <TextField source="business_name" label="Shop" emptyText="—" />
        <TextField source="city" emptyText="—" />
        <FunctionField
          label="Sponsor"
          render={(r) => (r.sponsor ? `${r.sponsor.name} (${r.sponsor.code})` : '—')}
        />
        <StatusField source="status" />
        <DateField source="created_at" showTime label="Submitted" />
      </Datagrid>
    </List>
  )
}
