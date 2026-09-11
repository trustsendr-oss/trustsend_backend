import {
  List,
  Datagrid,
  TextField,
  BooleanField,
  DateField,
  SearchInput,
  TopToolbar,
  CreateButton,
} from 'react-admin'
import { StatusField } from '../../components/StatusChip'

const filters = [<SearchInput source="q" alwaysOn placeholder="Search staff" />]

function InternalUserListActions() {
  return (
    <TopToolbar>
      <CreateButton />
    </TopToolbar>
  )
}

export function InternalUserList() {
  return (
    <List filters={filters} actions={<InternalUserListActions />} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="full_name" label="Name" />
        <TextField source="email" />
        <StatusField source="status" />
        <BooleanField source="mfa_enabled" label="MFA" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  )
}
