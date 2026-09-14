import { Create, SimpleForm, TextInput, SelectInput, required, minLength, regex, useGetList } from 'react-admin'
import { PlanFeaturesInput } from './PlanFeaturesInput'

const money = regex(/^(0|[1-9]\d*)$/, 'Must be a whole number (smallest currency unit)')

/** Currency the plan's prices are charged in — picked from the active currencies. */
function PlanCurrencyInput() {
  const { data: currencies = [], isPending } = useGetList<{ id: string; code: string; name: string; is_active: boolean }>(
    'currencies',
    { pagination: { page: 1, perPage: 500 }, sort: { field: 'code', order: 'ASC' } }
  )
  return (
    <SelectInput
      source="currency_code"
      label="Currency"
      isPending={isPending}
      choices={currencies
        .filter((c) => c.is_active)
        .map((c) => ({ id: c.code, name: `${c.code} — ${c.name}` }))}
      validate={required()}
      helperText="Currency the price and maintenance fee are charged in"
    />
  )
}

export function PlanCreate() {
  return (
    <Create redirect="show">
      <SimpleForm defaultValues={{ features: { webhooks: true }, currency_code: 'USD' }}>
        <TextInput source="code" validate={[required(), minLength(2)]} />
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <TextInput source="description" multiline minRows={2} />
        <TextInput source="price" validate={money} helperText="Smallest currency unit, e.g. cents" />
        <TextInput source="maintenance_price" validate={money} helperText="Recurring monthly fee, smallest unit" />
        <PlanCurrencyInput />
        <PlanFeaturesInput />
      </SimpleForm>
    </Create>
  )
}
