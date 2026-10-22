import { createHash, randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import DeviceSession from '#models/device_session'

const TOKEN_BYTES = 32
/**
 * Sliding: every successful PIN unlock pushes the expiry back, so only a device left unused this
 * long falls back to email + password.
 */
const SESSION_TTL_DAYS = 60

/**
 * SHA-256 rather than scrypt, as for PIN reset tokens: the token is 256 random bits, not a
 * secret a human chose, so there is no brute-force risk for a slow hash to mitigate.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class DeviceSessionService {
  /** Creates a session for this device and returns the raw token — the only time it exists. */
  static async issue(userId: number, platform: string | null): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    await DeviceSession.create({
      userId,
      platform,
      tokenHash: hashToken(token),
      expiresAt: DateTime.now().plus({ days: SESSION_TTL_DAYS }),
    })
    return token
  }

  /** The live session behind a raw token; `null` when unknown or expired. */
  static async find(token: string): Promise<DeviceSession | null> {
    const session = await DeviceSession.findBy('tokenHash', hashToken(token))
    if (!session) return null
    if (session.expiresAt < DateTime.now()) {
      await session.delete()
      return null
    }
    return session
  }

  /** Records a successful unlock and slides the expiry forward. */
  static async touch(session: DeviceSession): Promise<void> {
    session.lastUsedAt = DateTime.now()
    session.expiresAt = DateTime.now().plus({ days: SESSION_TTL_DAYS })
    await session.save()
  }

  /** Idempotent: an unknown token is simply nothing to revoke. */
  static async revoke(token: string): Promise<void> {
    await DeviceSession.query().where('tokenHash', hashToken(token)).delete()
  }
}
