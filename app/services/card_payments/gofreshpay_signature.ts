import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * GoFreshPay's two HMAC-SHA256 schemes. They are not mirror images of each other, so each one
 * is spelled out here exactly as their documentation describes it:
 *
 * - outgoing requests: hex(HMAC(api_secret, body + timestamp)), the body being the exact JSON
 *   string sent, the timestamp the exact `X-Timestamp` value;
 * - incoming webhooks: hex(HMAC(callback_secret, timestamp + raw body)), read from
 *   `X-FreshPay-Signature: t=<unix>,v1=<hex>`.
 */
export class GoFreshPaySignature {
  /**
   * ISO 8601 with an explicit `+00:00` offset rather than `Z`: their server parses it with
   * Python's `datetime.fromisoformat`, which only accepts `Z` from Python 3.11 on.
   */
  static timestamp(now: Date = new Date()): string {
    return now.toISOString().replace('Z', '+00:00')
  }

  static signRequest(apiSecret: string, body: string, timestamp: string): string {
    return createHmac('sha256', apiSecret)
      .update(body + timestamp)
      .digest('hex')
  }

  /**
   * `toleranceSeconds` bounds replays of a captured webhook. Their docs set no window for
   * webhooks, so it is generous; a stale but genuine webhook is still recovered by the
   * reconciliation sweep, which asks for the status directly.
   */
  static verifyWebhook(
    callbackSecret: string,
    header: string | undefined | null,
    rawBody: string,
    options: { now?: Date; toleranceSeconds?: number } = {}
  ): boolean {
    if (!header || !callbackSecret) return false

    const parts = new Map<string, string>()
    for (const part of header.split(',')) {
      const index = part.indexOf('=')
      if (index > 0) parts.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
    }
    const timestamp = parts.get('t')
    const received = parts.get('v1')
    if (!timestamp || !received || !/^\d+$/.test(timestamp) || !/^[0-9a-f]+$/i.test(received)) {
      return false
    }

    const tolerance = options.toleranceSeconds ?? 24 * 60 * 60
    const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000)
    if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) return false

    const expected = createHmac('sha256', callbackSecret)
      .update(Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBody, 'utf8')]))
      .digest('hex')

    // timingSafeEqual throws on a length mismatch instead of returning false.
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(received.toLowerCase(), 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
