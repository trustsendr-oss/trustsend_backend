import type { HttpContext } from '@adonisjs/core/http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const usdFlagSvg = readFileSync(
  fileURLToPath(new URL('../../resources/flags/usd.svg', import.meta.url)),
  'utf-8'
)

/**
 * Small static assets served from our own server rather than a third party's CDN — currently
 * just the USD flag icon (see wallet_controller.ts): USD is our primary wallet currency and
 * isn't meaningfully tied to any single country in PawaPay's active-conf, unlike every other
 * currency's flag_url which comes straight from PawaPay.
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
}
