/** API amounts are hundredths of the major unit for every currency. */
export function formatAmount(amount: string | number | null | undefined, currency?: string) {
  if (amount === null || amount === undefined) return '—'
  const major = Number(amount) / 100
  const text = major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency ? `${text} ${currency}` : text
}
