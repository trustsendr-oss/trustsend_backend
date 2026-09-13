import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }

  return output
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid base32 character in TOTP secret')
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s) for staff two-factor
 * authentication — compatible with Google Authenticator, 1Password, Authy, etc.
 *
 * Implemented on node:crypto directly rather than pulling a dependency for ~80 lines of
 * well-specified maths; covered by the RFC 6238 test vectors in tests/unit/totp_service.spec.ts.
 */
export class TotpService {
  static readonly PERIOD_SECONDS = 30
  static readonly DIGITS = 6
  /** Accept the previous and next time step too, to absorb clock drift between phone and server. */
  static readonly WINDOW = 1

  /** 160-bit random secret, base32-encoded as authenticator apps expect. */
  static generateSecret(): string {
    return base32Encode(randomBytes(20))
  }

  static otpauthUrl(accountName: string, secret: string, issuer = 'TrustSend Admin'): string {
    const label = encodeURIComponent(`${issuer}:${accountName}`)
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(this.DIGITS),
      period: String(this.PERIOD_SECONDS),
    })
    return `otpauth://totp/${label}?${params.toString()}`
  }

  static stepAt(timestampMs: number): number {
    return Math.floor(timestampMs / 1000 / this.PERIOD_SECONDS)
  }

  static generateForStep(secret: string, step: number, digits = this.DIGITS): string {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))

    const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
    const offset = hmac[hmac.length - 1] & 0x0f
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)

    return String(binary % 10 ** digits).padStart(digits, '0')
  }

  static generate(secret: string, timestampMs = Date.now()): string {
    return this.generateForStep(secret, this.stepAt(timestampMs))
  }

  /**
   * Returns the time step the code matched, or null. A code whose step is not strictly greater
   * than `lastUsedStep` is rejected, so an intercepted code cannot be replayed within its window.
   */
  static verify(
    secret: string,
    code: string,
    options: { timestampMs?: number; lastUsedStep?: number | null } = {}
  ): number | null {
    if (!/^\d{6}$/.test(code)) {
      return null
    }

    const currentStep = this.stepAt(options.timestampMs ?? Date.now())
    const candidate = Buffer.from(code)

    for (let offset = -this.WINDOW; offset <= this.WINDOW; offset++) {
      const step = currentStep + offset
      const expected = Buffer.from(this.generateForStep(secret, step))
      if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
        if (options.lastUsedStep !== undefined && options.lastUsedStep !== null && step <= options.lastUsedStep) {
          return null
        }
        return step
      }
    }

    return null
  }
}
