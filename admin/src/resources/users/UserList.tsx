import { List, Datagrid, TextField, DateField, SearchInput } from 'react-admin'

const filters = [<SearchInput source="q" alwaysOn placeholder="Search name, email or code" />]

export function UserList() {
  return (
    <List filters={filters} sort={{ field: 'created_at', order: 'DESC' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="code" />
        <TextField source="full_name" label="Name" />
        <TextField source="email" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  )
}
