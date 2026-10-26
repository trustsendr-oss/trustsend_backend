import { createHmac, timingSafeEqual } from 'node:crypto'
import env from '#start/env'

export class AlchemySignatureService {
  /**
   * Validates the `x-alchemy-signature` header: HMAC-SHA256 of the raw body with the webhook's
   * signing key.
   *
   * Each Alchemy webhook (one per network) has its own key, so `ALCHEMY_WEBHOOK_SIGNING_KEY`
   * may list several, comma-separated. With no key configured every request is refused — in
   * development too. An unsigned request is exactly what a forged deposit looks like.
   */
  static verify(rawBody: string | Buffer, signatureHeader: string | null | undefined): boolean {
    const keys = (env.get('ALCHEMY_WEBHOOK_SIGNING_KEY', '') ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
    if (keys.length === 0 || !signatureHeader) {
      return false
    }

    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
    const header = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8')

    return keys.some((key) => {
      const computed = Buffer.from(createHmac('sha256', key).update(body).digest('hex'), 'utf8')
      return computed.length === header.length && timingSafeEqual(computed, header)
    })
  }

  /** Signs a payload the way Alchemy does (tests). */
  static sign(payload: string, signingKey: string): string {
    return createHmac('sha256', signingKey).update(payload).digest('hex')
  }
}
