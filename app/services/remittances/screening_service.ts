import WatchlistEntry from '#models/watchlist_entry'

/** Lower-case, accents stripped, punctuation removed, tokens sorted — order-insensitive. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

export type ScreeningHit = { name: string; entry: string; source: string; reference: string | null }

/**
 * Sanctions / watchlist screening of the parties to a remittance.
 *
 * Deliberately conservative and local: a name is a hit when every token of a watchlist entry
 * appears in it (so "Jean-Pierre Bemba Gombo" hits an entry "Bemba Jean Pierre"). A hit does not
 * refuse the transfer — it holds it for a human decision in the admin console, since names
 * collide. This is the seam where a commercial screening provider plugs in later; the list itself
 * is managed from the admin console (UN, OFAC, EU exports, internal entries).
 */
export class ScreeningService {
  static async screen(names: string[]): Promise<ScreeningHit[]> {
    const entries = await WatchlistEntry.all()
    if (entries.length === 0) return []

    const hits: ScreeningHit[] = []
    for (const name of names) {
      const tokens = new Set(normalizeName(name).split(' ').filter(Boolean))
      if (tokens.size === 0) continue
      for (const entry of entries) {
        const entryTokens = entry.normalizedName.split(' ').filter(Boolean)
        if (entryTokens.length > 0 && entryTokens.every((token) => tokens.has(token))) {
          hits.push({
            name,
            entry: entry.fullName,
            source: entry.source,
            reference: entry.reference,
          })
        }
      }
    }
    return hits
  }
}
