import {
  List,
  Datagrid,
  TextField,
  DateField,
  ReferenceField,
  SearchInput,
  SelectInput,
  ReferenceInput,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const ROLES = [
  { id: 'teller', name: 'Teller' },
  { id: 'credit_officer', name: 'Credit officer' },
  { id: 'branch_manager', name: 'Branch manager' },
  { id: 'admin', name: 'Institution admin' },
]

const filters = [
  <SearchInput key="q" source="q" alwaysOn placeholder="Search person or institution" />,
  <ReferenceInput key="business_id" source="business_id" reference="businesses" />,
  <SelectInput key="role" source="role" choices={ROLES} />,
  <SelectInput
    key="status"
    source="status"
    choices={[
      { id: 'active', name: 'Active' },
      { id: 'suspended', name: 'Suspended' },
      { id: 'terminated', name: 'Terminated' },
    ]}
  />,
]

/**
 * The people who work for partner institutions. `agent_name` is the counter they are posted to —
 * blank for roles that are not tied to one, such as a branch manager.
 */
export function BusinessStaffList() {
  return (
    <List filters={filters} sort={{ field: 'created_at', order: 'DESC' }}>
      <Datagrid rowClick="show">
        <TextField source="user_name" label="Person" />
        <ReferenceField source="business_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="role" />
        <TextField source="agent_name" label="Counter" emptyText="—" />
        <StatusField source="status" />
        <DateField source="created_at" />
      </Datagrid>
    </List>
  )
}
