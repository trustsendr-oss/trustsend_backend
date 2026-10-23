import { List, Datagrid, TextField, DateField, FunctionField, SelectInput } from 'react-admin'
import { StatusField } from '../../components/StatusChip'
import { formatAmount } from '../remittances/format'

const filters = [
  <SelectInput
    key="status"
    source="status"
    alwaysOn
    choices={[
      { id: 'suspended', name: 'Suspended (needs support)' },
      { id: 'active', name: 'Active' },
      { id: 'locked', name: 'Locked (signing)' },
      { id: 'recruiting', name: 'Recruiting' },
      { id: 'completed', name: 'Completed' },
      { id: 'cancelled', name: 'Cancelled' },
    ]}
  />,
]

/** Private rotating savings groups. The default view is the suspended queue: those wait on us. */
export function LikilibaList() {
  return (
    <List filters={filters} filterDefaultValues={{ status: 'suspended' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="code" label="Reference" />
        <TextField source="name" />
        <FunctionField
          label="Contribution"
          render={(r) => `${formatAmount(r.contribution_amount, r.currency_code)} · ${r.frequency}`}
        />
        <TextField source="size" label="Members" />
        <FunctionField
          label="Round"
          render={(r) => (r.current_round ? `${r.current_round} / ${r.size}` : '—')}
        />
        <FunctionField label="Caution" render={(r) => (r.caution.required ? 'Required' : 'None')} />
        <StatusField source="status" />
        <DateField source="starts_at" label="First round" showTime />
      </Datagrid>
    </List>
  )
}
