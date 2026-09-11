import { Edit, SimpleForm, TextInput, required, minLength, regex } from 'react-admin'
import { JsonInput } from '../../components/JsonInput'

const money = regex(/^(0|[1-9]\d*)$/, 'Must be a whole number (smallest currency unit)')

export function PlanEdit() {
  return (
    <Edit redirect="show">
      <SimpleForm>
        <TextInput source="code" disabled helperText="Code cannot be changed" />
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <TextInput source="description" multiline minRows={2} />
        <TextInput source="price" validate={money} />
        <TextInput source="maintenance_price" validate={money} />
        <JsonInput source="features" label="Features" />
      </SimpleForm>
    </Edit>
  )
}
