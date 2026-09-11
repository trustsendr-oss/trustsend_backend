import {
  List,
  Datagrid,
  TextField,
  DateField,
  FunctionField,
  SelectInput,
  TextInput,
  DateInput,
} from 'react-admin'

const filters = [
  <TextInput source="action" label="Action" helperText="Matches partially, e.g. 'suspend'" alwaysOn />,
  <SelectInput
    source="actor_type"
    choices={['user', 'agent', 'internal_user', 'system', 'business'].map((s) => ({ id: s, name: s }))}
  />,
  <TextInput source="resource_type" label="Resource type" helperText="e.g. agent, business, card" />,
  <TextInput source="resource_id" label="Resource ID" />,
  <DateInput source="date_from" />,
  <DateInput source="date_to" />,
]

export function AuditLogList() {
  return (
    <List filters={filters} sort={{ field: 'created_at', order: 'DESC' }} perPage={25}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="id" />
        <FunctionField label="Actor" render={(r) => `${r.actor_type} #${r.actor_id}`} />
        <TextField source="action" />
        <FunctionField
          label="Resource"
          render={(r) => `${r.resource_type} #${r.resource_id}`}
        />
        <TextField source="correlation_id" />
        <DateField source="created_at" showTime />
      </Datagrid>
    </List>
  )
}
