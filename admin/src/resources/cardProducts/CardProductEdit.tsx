import {
  Edit,
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
 * `code` and `currency_code` are absent on purpose: the code is the stable identifier clients
 * refer to, and repricing in another currency would make an existing catalogue incomparable.
 *
 * Edits apply to future sales only — cards already issued carry the category they were sold
 * under, so raising a price never bills an existing holder retroactively.
 */
export function CardProductEdit() {
  return (
    <Edit redirect="show" mutationMode="pessimistic">
      <SimpleForm>
        <TextInput source="name" validate={[required(), minLength(2)]} />
        <TextInput source="description" multiline minRows={2} />
        <TextInput source="issuance_price" validate={money} helperText="Smallest unit. Applies to future purchases only." />
        <TextInput source="max_balance" validate={money} helperText="Empty = no ceiling." />
        <NumberInput source="max_active_cards" min={1} helperText="Empty = unlimited." />
        <TextInput source="per_topup_limit" validate={money} helperText="Empty = no ceiling." />
        <TextInput source="daily_topup_limit" validate={money} helperText="Empty = no ceiling." />
        <TextInput source="monthly_topup_limit" validate={money} helperText="Empty = no ceiling." />
        <ImageInput
          source="image"
          label="Card artwork"
          accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
          maxSize={2 * 1024 * 1024}
          helperText="PNG, JPEG or WebP, 2 MB max. Uploading a new one replaces the current image."
        >
          <ImageField source="src" title="title" />
        </ImageInput>
      </SimpleForm>
    </Edit>
  )
}
