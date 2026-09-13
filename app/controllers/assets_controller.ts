import type { HttpContext } from '@adonisjs/core/http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Currency from '#models/currency'
import { CurrencyLogoService } from '#services/money/currency_logo_service'

const usdFlagSvg = readFileSync(
  fileURLToPath(new URL('../../resources/flags/usd.svg', import.meta.url)),
  'utf-8'
)

/**
 * Small static assets served from our own server rather than a third party's CDN: wallet
 * currency logos (see CurrencyService.defaultLogoUrl) and the legacy USD flag URL.
 */
export default class AssetsController {
  /**
   * GET /assets/flags/usd.svg
   */
  async usdFlag({ response }: HttpContext) {
    response.header('Content-Type', 'image/svg+xml')
    response.header('Cache-Control', 'public, max-age=86400')
    return response.send(usdFlagSvg)
  }

  /**
   * GET /assets/currencies/:file (e.g. CDF.svg) — the logo behind every wallet's logo_url: the
   * issuing country's flag, or a generated badge for currencies shared by several countries.
   */
  async currencyLogo({ params, response }: HttpContext) {
    const match = /^([A-Za-z]{3})\.svg$/.exec(String(params.file ?? ''))
    if (!match) {
      return response.notFound({ message: 'Not found' })
    }

    const code = match[1].toUpperCase()
    const currency = await Currency.find(code)
    const { svg } = CurrencyLogoService.render(code, currency?.countryCode, currency?.symbol)

    response.header('Content-Type', 'image/svg+xml')
    response.header('Cache-Control', 'public, max-age=86400')
    response.header('X-Content-Type-Options', 'nosniff')
    // An SVG opened directly is a document: never let it run script or load anything
    response.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
    return response.send(svg)
  }
}
