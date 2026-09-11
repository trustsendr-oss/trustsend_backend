import {
  Create,
  SimpleForm,
  TextInput,
  NumberInput,
  ImageInput,
  ImageField,
  required,
  minLength,
  regex,
} from 'react-admin'

const money = regex(/^(0|[1-9]\d*)$/, 'Must be a whole number (smallest currency unit)')

/**
 * Every amount is a smallest-unit integer string, matching the API and PlanCreate — a category
 * priced "5.00" would be read as 5 cents.
 *
 * Leaving a limit empty means "no ceiling". That is why the fields are plain optional inputs
 * rather than numbers defaulting to zero: a category capped at zero would sell a card that can
 * never be funded.
 */
export function CardProductCreate() {
  return (
    <Create redirect="show">
      <SimpleForm>
        <TextInput source="code" validate={[required(), minLength(2)]} helperText="Stable identifier, e.g. premium" />
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <TextInput source="description" multiline minRows={2} />
        <TextInput source="currency_code" defaultValue="USD" helperText="3-letter ISO code. Card issuing is USD-only today." />
        <TextInput
          source="issuance_price"
          validate={money}
          defaultValue="0"
          helperText="Charged once when the card is bought. Smallest unit — 500 means 5.00. 0 keeps it free."
        />
        <TextInput source="max_balance" validate={money} helperText="Highest balance a card may hold. Empty = no ceiling." />
        <NumberInput source="max_active_cards" min={1} helperText="How many of this category one holder may own. Empty = unlimited." />
        <TextInput source="per_topup_limit" validate={money} helperText="Largest single top-up. Empty = no ceiling." />
        <TextInput source="daily_topup_limit" validate={money} helperText="Rolling 24h top-up total. Empty = no ceiling." />
        <TextInput source="monthly_topup_limit" validate={money} helperText="Rolling 30d top-up total. Empty = no ceiling." />
        <ImageInput
          source="image"
          label="Card artwork"
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          maxSize={2 * 1024 * 1024}
          helperText="PNG, JPEG or WebP, 2 MB max. Shown to customers on the card face."
        >
          <ImageField source="src" title="title" />
        </ImageInput>
      </SimpleForm>
    </Create>
  )
}
