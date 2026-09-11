import Typography from '@mui/material/Typography'
import { useRecordContext } from 'react-admin'

/**
 * Amounts throughout this API are bigint smallest-currency-unit strings (see
 * app/services/money/money.ts — Money never divides by 100, it's an opaque integer unit), so
 * this only adds thousands separators, never a decimal point.
 */
function format(amount: string | number | bigint | undefined, currency?: string) {
  if (amount === undefined || amount === null) return '—'
  const num = BigInt(amount)
  const formatted = num.toLocaleString('en-US')
  return currency ? `${currency} ${formatted}` : formatted
}

export function MoneyField({
  source,
  currencySource = 'currency_code',
  sortBy: _sortBy,
  sortable: _sortable,
  label: _label,
}: {
  source: string
  currencySource?: string
  sortBy?: string
  sortable?: boolean
  label?: string
}) {
  const record = useRecordContext()
  if (!record) return null
  return (
    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
      {format(record[source], record[currencySource])}
    </Typography>
  )
}

export function formatMoney(amount: string | number | bigint | undefined, currency?: string) {
  return format(amount, currency)
}
