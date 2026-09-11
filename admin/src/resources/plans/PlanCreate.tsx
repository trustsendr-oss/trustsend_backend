import { Create, SimpleForm, TextInput, required, minLength, regex } from 'react-admin'
import { JsonInput } from '../../components/JsonInput'

const money = regex(/^(0|[1-9]\d*)$/, 'Must be a whole number (smallest currency unit)')

export function PlanCreate() {
  return (
    <Create redirect="show">
      <SimpleForm defaultValues={{ features: { webhooks: true } }}>
        <TextInput source="code" validate={[required(), minLength(2)]} />
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <TextInput source="description" multiline minRows={2} />
        <TextInput source="price" validate={money} helperText="Smallest currency unit, e.g. cents" />
        <TextInput source="maintenance_price" validate={money} helperText="Recurring monthly fee, smallest unit" />
        <TextInput source="currency_code" defaultValue="USD" helperText="3-letter ISO code" />
        <JsonInput
          source="features"
          label="Features"
          helperText='e.g. { "mobile_money.deposits": true, "cards.issuing": { "currencies": ["USD"] } }'
        />
      </SimpleForm>
    </Create>
  )
}
