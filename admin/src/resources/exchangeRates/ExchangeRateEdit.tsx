import {
  Edit,
  SimpleForm,
  TextInput,
  NumberInput,
  FunctionField,
  regex,
  minValue,
  maxValue,
  required,
  useRecordContext,
} from 'react-admin'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { CurrencyLogo } from '../currencies/CurrencyLogo'

const decimalRate = regex(/^\d{1,18}(\.\d{1,12})?$/, 'Positive number, dot as decimal separator')

type RateRecord = {
  currency_code: string
  name: string
  logo_url?: string
  effective_rate: string | null
  source: string | null
}

function toPayload(data: Record<string, any>) {
  const manual = data.manual_rate === null || data.manual_rate === undefined ? '' : String(data.manual_rate).trim()
  return {
    ...(data.currency_code === 'USD' ? {} : { manual_rate: manual === '' ? null : manual }),
    margin_bps: Number(data.margin_bps),
  }
}

function ManualRateInput() {
  const record = useRecordContext<RateRecord>()
  const isBase = record?.currency_code === 'USD'
  return (
    <TextInput
      source="manual_rate"
      label={`Manual rate (${record?.currency_code ?? ''} for 1 USD)`}
      validate={decimalRate}
      disabled={isBase}
      helperText={
        isBase ? 'USD is the base currency, its rate is always 1' : 'Leave empty to use the international market rate'
      }
      fullWidth
    />
  )
}

export function ExchangeRateEdit() {
  return (
    <Edit mutationMode="pessimistic" transform={toPayload} redirect="list" title="Edit exchange rate">
      <SimpleForm>
        <FunctionField
          render={(record: RateRecord) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <CurrencyLogo src={record.logo_url} code={record.currency_code} size={56} />
              <Box>
                <Typography variant="h6">
                  {record.currency_code} · {record.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {record.effective_rate
                    ? `1 USD = ${record.effective_rate} ${record.currency_code} (${record.source})`
                    : 'No usable rate: set a manual rate or refresh market rates'}
                </Typography>
              </Box>
            </Box>
          )}
        />
        <TextInput source="market_rate" label="International market rate" disabled fullWidth />
        <ManualRateInput />
        <NumberInput
          source="margin_bps"
          label="Margin (basis points)"
          validate={[required(), minValue(0), maxValue(2000)]}
          helperText="100 = 1%. The higher margin of the two currencies applies to a swap."
        />
      </SimpleForm>
    </Edit>
  )
}
