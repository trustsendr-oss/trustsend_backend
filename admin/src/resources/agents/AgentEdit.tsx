import { Edit, SimpleForm, TextInput, NumberInput, required, email, minLength, minValue } from 'react-admin'

// Stored as smallest-currency-unit strings server-side (USD cents) — displayed/edited in dollars.
const toDollars = (v: unknown) => (v === null || v === undefined || v === '' ? v : Number(v) / 100)
const toCents = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(Math.round(Number(v) * 100)))

export function AgentEdit() {
  return (
    <Edit redirect="show">
      <SimpleForm>
        <TextInput source="full_name" validate={[required(), minLength(3)]} />
        <TextInput source="email" validate={[required(), email()]} />
        <TextInput source="phone" validate={required()} />
        <TextInput source="business_name" label="Business/outlet name" helperText="Optional — shown instead of full_name when set" />
        <TextInput source="region" helperText="Optional" />
        <TextInput source="city" helperText="Optional" />
        <TextInput source="address" helperText="Optional" />
        <NumberInput source="latitude" helperText="Optional" />
        <NumberInput source="longitude" helperText="Optional" />
        <NumberInput
          source="per_transaction_limit"
          label="Per-transaction limit (USD)"
          format={toDollars}
          parse={toCents}
          helperText="Leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
        <NumberInput
          source="daily_limit"
          label="Daily limit (USD)"
          format={toDollars}
          parse={toCents}
          helperText="Leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
        <NumberInput
          source="monthly_limit"
          label="Monthly limit (USD)"
          format={toDollars}
          parse={toCents}
          helperText="Leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
      </SimpleForm>
    </Edit>
  )
}
