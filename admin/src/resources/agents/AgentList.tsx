import {
  List,
  Datagrid,
  TextField,
  DateField,
  SearchInput,
  SelectInput,
  TopToolbar,
  CreateButton,
  ExportButton,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [
  <SearchInput source="q" alwaysOn placeholder="Search name or email" />,
  <SelectInput
    source="status"
    choices={[
      { id: 'pending_approval', name: 'Pending approval' },
      { id: 'active', name: 'Active' },
      { id: 'suspended', name: 'Suspended' },
      { id: 'terminated', name: 'Terminated' },
    ]}
  />,
]

function AgentListActions() {
  return (
    <TopToolbar>
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  )
}

export function AgentList() {
  return (
    <List
      filters={filters}
      actions={<AgentListActions />}
      sort={{ field: 'created_at', order: 'DESC' }}
      perPage={25}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="full_name" label="Name" />
        <TextField source="email" />
        <StatusField source="status" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  )
}
