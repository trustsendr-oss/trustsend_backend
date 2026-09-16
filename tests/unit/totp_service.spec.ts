import { test } from '@japa/runner'
import { TotpService } from '#services/security/totp_service'

// RFC 6238 appendix B — SHA1 seed "12345678901234567890", base32-encoded
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

test.group('TotpService', () => {
  test('matches the RFC 6238 SHA1 test vectors', ({ assert }) => {
    const vectors: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ]

    for (const [seconds, expected] of vectors) {
      const step = TotpService.stepAt(seconds * 1000)
      assert.equal(TotpService.generateForStep(RFC_SECRET, step, 8), expected)
      assert.equal(TotpService.generateForStep(RFC_SECRET, step), expected.slice(-6))
    }
  })

  test('accepts a code from the adjacent time step to absorb clock drift', ({ assert }) => {
    const now = 1_700_000_000_000
    const previousCode = TotpService.generate(RFC_SECRET, now - 30_000)

    assert.equal(
      TotpService.verify(RFC_SECRET, previousCode, { timestampMs: now }),
      TotpService.stepAt(now) - 1
    )
  })

  test('rejects codes outside the window', ({ assert }) => {
    const now = 1_700_000_000_000
    const staleCode = TotpService.generate(RFC_SECRET, now - 5 * 60_000)

    assert.isNull(TotpService.verify(RFC_SECRET, staleCode, { timestampMs: now }))
  })

  test('rejects a replayed code', ({ assert }) => {
    const now = 1_700_000_000_000
    const code = TotpService.generate(RFC_SECRET, now)
    const step = TotpService.verify(RFC_SECRET, code, { timestampMs: now })

    assert.isNotNull(step)
    assert.isNull(TotpService.verify(RFC_SECRET, code, { timestampMs: now, lastUsedStep: step }))
  })

  test('rejects malformed codes', ({ assert }) => {
    assert.isNull(TotpService.verify(RFC_SECRET, '12345'))
    assert.isNull(TotpService.verify(RFC_SECRET, 'abcdef'))
  })

  test('generates a base32 secret usable in an otpauth URL', ({ assert }) => {
    const secret = TotpService.generateSecret()

    assert.match(secret, /^[A-Z2-7]{32}$/)
    assert.include(TotpService.otpauthUrl('staff@trustsend.africa', secret), `secret=${secret}`)
  })
})
