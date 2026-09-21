import { Show, SimpleShowLayout, TextField, DateField, ReferenceField } from 'react-admin'
import { StatusField } from '../../components/StatusChip'

export function BusinessStaffShow() {
  return (
    <Show>
      <SimpleShowLayout>
        <TextField source="user_name" label="Person" />
        <ReferenceField source="user_id" reference="users" label="Account" link="show">
          <TextField source="full_name" />
        </ReferenceField>
        <ReferenceField source="business_id" reference="businesses" label="Institution" link="show">
          <TextField source="name" />
        </ReferenceField>
        <TextField source="role" />
        <TextField source="agent_name" label="Counter" emptyText="Not posted to a counter" />
        <StatusField source="status" />
        <DateField source="created_at" showTime />
        <DateField source="updated_at" showTime />
      </SimpleShowLayout>
    </Show>
  )
}
