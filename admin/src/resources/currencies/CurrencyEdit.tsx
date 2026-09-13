import {
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  BooleanInput,
  FunctionField,
  required,
  minLength,
  maxLength,
  regex,
} from 'react-admin'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { CurrencyLogo } from './CurrencyLogo'

const httpsUrl = regex(/^https:\/\/\S+$/, 'Must be an https:// URL')

// The record also carries read-only fields (code, decimals, the resolved logo_url…): only the
// editable ones are sent, and the custom logo maps back to the API's logo_url.
function toPayload(data: Record<string, any>) {
  return {
    name: data.name,
    symbol: data.symbol || null,
    logo_url: data.custom_logo_url || null,
    is_active: Boolean(data.is_active),
    sort_order: Number(data.sort_order),
  }
}

export function CurrencyEdit() {
  return (
    <Edit mutationMode="pessimistic" transform={toPayload} redirect="list">
      <SimpleForm>
        <FunctionField
          render={(record: { code: string; logo_url?: string; country_code?: string | null }) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <CurrencyLogo src={record.logo_url} code={record.code} size={56} />
              <Box>
                <Typography variant="h6">{record.code}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {record.country_code ? `Flag of ${record.country_code}` : 'Generated badge (shared currency)'}
                </Typography>
              </Box>
            </Box>
          )}
        />
        <TextInput source="code" disabled helperText="ISO 4217 code cannot be changed" />
        <NumberInput
          source="decimals"
          disabled
          helperText="ISO 4217 minor units, not editable"
        />
        <TextInput source="name" validate={[required(), minLength(2), maxLength(100)]} />
        <TextInput source="symbol" validate={maxLength(10)} />
        <TextInput
          source="custom_logo_url"
          label="Custom logo URL"
          validate={[httpsUrl, maxLength(500)]}
          helperText="Leave empty to use the country flag or the generated badge"
          fullWidth
        />
        <BooleanInput source="is_active" label="Open for new wallets" />
        <NumberInput source="sort_order" label="Display order" validate={required()} />
      </SimpleForm>
    </Edit>
  )
}
