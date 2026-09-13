import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Country flags from the MIT-licensed flag-icons package (see resources/flags/4x3/LICENSE),
// copied locally so wallet logos never depend on a third-party host.
const FLAGS_DIR = fileURLToPath(new URL('../../../resources/flags/4x3/', import.meta.url))

const flagCache = new Map<string, string | null>()

const BADGE_BACKGROUND = '#020D30'
const BADGE_FOREGROUND = '#FFFFFF'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Builds the image behind a wallet's logo_url: the issuing country's flag when the currency has
 * one, otherwise a round badge showing its symbol or code — the case for currencies shared by
 * several countries (XAF, XOF, XCD, …), for which no single flag is correct.
 */
export class CurrencyLogoService {
  static flagSvg(countryCode: string | null | undefined): string | null {
    if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) {
      return null
    }

    const key = countryCode.toLowerCase()
    if (!flagCache.has(key)) {
      const path = `${FLAGS_DIR}${key}.svg`
      flagCache.set(key, existsSync(path) ? readFileSync(path, 'utf-8') : null)
    }
    return flagCache.get(key) ?? null
  }

  /** The symbol when it is short and unambiguous enough to read on a badge, the code otherwise. */
  static badgeLabel(code: string, symbol?: string | null): string {
    const trimmed = symbol?.trim()
    if (trimmed && [...trimmed].length <= 4 && !/^\$+$/.test(trimmed)) {
      return trimmed
    }
    return code.toUpperCase()
  }

  static badgeSvg(code: string, symbol?: string | null): string {
    const label = this.badgeLabel(code, symbol)
    const length = [...label].length
    const fontSize = length <= 1 ? 30 : length === 2 ? 24 : length === 3 ? 19 : 15

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${escapeXml(code.toUpperCase())}">` +
      `<rect width="64" height="64" rx="32" fill="${BADGE_BACKGROUND}"/>` +
      `<text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="${BADGE_FOREGROUND}">${escapeXml(label)}</text>` +
      `</svg>`
    )
  }

  static render(
    code: string,
    countryCode?: string | null,
    symbol?: string | null
  ): { svg: string; kind: 'flag' | 'badge' } {
    const flag = this.flagSvg(countryCode)
    return flag ? { svg: flag, kind: 'flag' } : { svg: this.badgeSvg(code, symbol), kind: 'badge' }
  }
}
