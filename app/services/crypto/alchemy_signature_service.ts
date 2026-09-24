import { createHmac, timingSafeEqual } from 'node:crypto'
import env from '#start/env'

export class AlchemySignatureService {
  /**
   * Validate an inbound Alchemy webhook signature.
   * Alchemy signs using HMAC-SHA256 with the signing key configured for the webhook in the dashboard.
   * Signature is sent in the `x-alchemy-signature` header.
   */
  static verify(rawBody: string | Buffer, signatureHeader: string | null | undefined): boolean {
    const signingKey = env.get('ALCHEMY_WEBHOOK_SIGNING_KEY', '')
    if (!signingKey) {
      // In development / sandbox without signing key configured, we log warning and allow if NODE_ENV !== production
      if (env.get('NODE_ENV') === 'development' || env.get('NODE_ENV') === 'test') {
        return true
      }
      return false
    }

    if (!signatureHeader) {
      return false
    }

    try {
      const hmac = createHmac('sha256', signingKey)
      hmac.update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      const computedSignature = hmac.digest('hex')

      const computedBuf = Buffer.from(computedSignature, 'utf8')
      const headerBuf = Buffer.from(signatureHeader, 'utf8')

      if (computedBuf.length !== headerBuf.length) {
        return false
      }

      return timingSafeEqual(computedBuf, headerBuf)
    } catch {
      return false
    }
  }

  /**
   * Helper to sign a test payload (useful in unit/integration tests).
   */
  static sign(payload: string, signingKey: string): string {
    return createHmac('sha256', signingKey).update(payload).digest('hex')
  }
}
