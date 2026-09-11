import { createHmac, timingSafeEqual } from 'node:crypto'
import { SecretsProvider } from '#services/security/secrets_provider'

export class PayscribeSignatureException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayscribeSignatureException'
  }
}

/**
 * Verifies Payscribe's inbound card webhook signature: X-Payscribe-Signature =
 * HMAC-SHA256(secret_key, raw_request_body), per https://docs.payscribe.co/. This is the ONLY
 * thing standing between "a real Payscribe callback" and "anyone on the internet POSTing a fake
 * card.status.changed to our webhook" — treat every change here as security-critical, same as
 * pawapay_signature_service.ts.
 *
 * Deliberately hand-rolled instead of reusing WebhookService.verifySignature() (used for OUR
 * outbound webhooks to merchants, the opposite trust direction): that helper calls
 * crypto.timingSafeEqual() directly on the caller-supplied header, which THROWS if the header is
 * a different length than the computed digest — an attacker sending a short/malformed header
 * would crash the request instead of cleanly failing verification. This service normalizes
 * length first so a malformed header always fails closed, never throws past this method except
 * via the declared PayscribeSignatureException.
 */
export class PayscribeSignatureService {
  /** @throws PayscribeSignatureException if the header is missing, malformed, or doesn't match. */
  static verify(rawBody: string, signatureHeader: string | undefined): void {
    if (!signatureHeader) {
      throw new PayscribeSignatureException('Missing X-Payscribe-Signature header')
    }

    const expected = createHmac('sha256', SecretsProvider.getPayscribeWebhookSecret())
      .update(rawBody)
      .digest('hex')

    const provided = Buffer.from(signatureHeader)
    const expectedBuffer = Buffer.from(expected)

    const isValid =
      provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer)

    if (!isValid) {
      throw new PayscribeSignatureException('Signature verification failed')
    }
  }
}
