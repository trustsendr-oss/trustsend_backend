/**
 * What an institution IS — never what it may sell, which is the plan's job.
 *
 * Kept in one place because three screens need it (creating, listing, reading a business) and
 * three copies of a label map is how they end up disagreeing: one screen showing "IMF" while
 * another shows "imf" and a third still offers a kind the API stopped accepting.
 *
 * The ids are the values the `businesses.kind` CHECK constraint accepts, so adding one here
 * without widening that constraint produces a business the database refuses.
 */
export const BUSINESS_KINDS = [
  { id: 'merchant', name: 'Merchant' },
  { id: 'imf', name: 'Microfinance institution' },
  { id: 'bank', name: 'Bank' },
  { id: 'insurer', name: 'Insurer' },
] as const

/** The readable name for a stored kind, falling back to the raw value rather than to nothing. */
export function businessKindLabel(kind?: string | null): string {
  if (!kind) return '—'
  return BUSINESS_KINDS.find((entry) => entry.id === kind)?.name ?? kind
}
