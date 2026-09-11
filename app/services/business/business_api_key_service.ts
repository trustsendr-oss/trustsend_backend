import hash from '@adonisjs/core/services/hash'
import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import env from '#start/env'
import BusinessApiKey from '#models/business_api_key'
import Business from '#models/business'
import { AuditLoggerService } from '#services/audit/audit_logger_service'

/**
 * Issues and verifies business API keys. The full key is generated once, returned to the
 * caller, and never stored — only its hash (scrypt, via the same hash service PIN/password use)
 * and a short prefix (for fast lookup + display, e.g. "showing key biz_live_a1b2...") are
 * persisted. There is no way to recover a lost key — only revoke it and issue a new one.
 */
export class BusinessApiKeyService {
  private static readonly KEY_BYTES = 32 // 256 bits of entropy in the secret portion
  private static readonly PREFIX_LENGTH = 16

  static async generate(
    businessId: number,
    issuedBy: number,
    correlationId: string,
    issuedByType: 'internal_user' | 'business' = 'internal_user'
  ): Promise<{ apiKey: string; keyId: number }> {
    const envLabel = env.get('PAWAPAY_ENV') === 'production' ? 'biz_live_' : 'biz_sandbox_'
    const secret = randomBytes(this.KEY_BYTES).toString('hex')
    const fullKey = `${envLabel}${secret}`
    const keyPrefix = fullKey.slice(0, this.PREFIX_LENGTH)
    const keyHash = await hash.make(fullKey)

    const record = await BusinessApiKey.create({
      businessId,
      keyPrefix,
      keyHash,
      status: 'active',
    })

    await AuditLoggerService.record({
      actorType: issuedByType,
      actorId: issuedBy,
      action: 'business.api_key.issued',
      resourceType: 'business_api_key',
      resourceId: record.id,
      before: undefined,
      after: { business_id: businessId, key_prefix: keyPrefix },
      correlationId,
    })

    return { apiKey: fullKey, keyId: record.id }
  }

  /**
   * Verifies a presented API key and returns the associated, active Business — or null if the
   * key is invalid, revoked, or the business itself isn't active. Checked on every request, no
   * caching of the key's status: a revoked key must stop working immediately.
   */
  static async verify(presentedKey: string): Promise<Business | null> {
    if (!presentedKey || presentedKey.length < this.PREFIX_LENGTH) {
      return null
    }

    const keyPrefix = presentedKey.slice(0, this.PREFIX_LENGTH)

    // Prefix collisions are possible (it's a display/lookup aid, not the full secret) — check
    // every active candidate with this prefix rather than assuming the first match is right.
    const candidates = await BusinessApiKey.query().where('key_prefix', keyPrefix).where('status', 'active')

    for (const candidate of candidates) {
      const matches = await hash.verify(candidate.keyHash, presentedKey)
      if (!matches) continue

      const business = await Business.find(candidate.businessId)
      if (!business || business.status !== 'active') {
        return null
      }

      candidate.lastUsedAt = DateTime.now()
      await candidate.save()

      return business
    }

    return null
  }

  static async revoke(
    keyId: number,
    revokedBy: number,
    correlationId: string,
    revokedByType: 'internal_user' | 'business' = 'internal_user'
  ): Promise<void> {
    const key = await BusinessApiKey.findOrFail(keyId)

    if (key.status === 'revoked') {
      return
    }

    key.status = 'revoked'
    key.revokedAt = DateTime.now()
    await key.save()

    await AuditLoggerService.record({
      actorType: revokedByType,
      actorId: revokedBy,
      action: 'business.api_key.revoked',
      resourceType: 'business_api_key',
      resourceId: key.id,
      before: { status: 'active' },
      after: { status: 'revoked' },
      correlationId,
    })
  }
}
