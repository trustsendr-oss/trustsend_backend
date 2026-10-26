import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type Business from '#models/business'
import { AuditLoggerService } from '#services/audit/audit_logger_service'
import { sniffImageMimeType } from '#services/cards/card_art_storage_service'

const STORAGE_DIR = fileURLToPath(new URL('../../../storage/business_logos/', import.meta.url))

export const ALLOWED_LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
export const MAX_LOGO_SIZE_BYTES = 1024 * 1024 // 1 Mo

export class InvalidLogoException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidLogoException'
  }
}

type Actor = { type: 'business' | 'internal_user'; id: number }

/**
 * An institution's logo.
 *
 * Not encrypted and served publicly, like card art (CardArtStorageService): it is made to be seen
 * in the catalogue of offers, which is itself public. The file name is a random UUID unrelated to
 * the business id, so nothing can be enumerated. The type comes from the bytes, never from the
 * header the client announced.
 */
export class BusinessLogoService {
  static urlOf(business: Pick<Business, 'id' | 'logoRef'>): string | null {
    return business.logoRef
      ? `/api/v1/finance/institutions/${business.id}/logo?v=${business.logoRef.slice(0, 8)}`
      : null
  }

  static async set(business: Business, bytes: Buffer, actor: Actor, correlationId: string) {
    if (bytes.byteLength > MAX_LOGO_SIZE_BYTES) {
      throw new InvalidLogoException('A logo must be 1 MB or smaller')
    }
    const mimeType = sniffImageMimeType(bytes)
    if (!mimeType) {
      throw new InvalidLogoException('A logo must be a PNG, JPEG or WebP image')
    }

    await mkdir(STORAGE_DIR, { recursive: true })
    const ref = randomUUID()
    await writeFile(`${STORAGE_DIR}${ref}`, bytes)

    const previous = business.logoRef
    business.logoRef = ref
    business.logoMimeType = mimeType
    await business.save()
    if (previous) await this.forget(previous)

    await AuditLoggerService.record({
      actorType: actor.type,
      actorId: actor.id,
      action: 'business.logo_updated',
      resourceType: 'business',
      resourceId: business.id,
      after: { mime_type: mimeType, size: bytes.byteLength },
      correlationId,
    })
    return business
  }

  static async remove(business: Business, actor: Actor, correlationId: string) {
    const previous = business.logoRef
    if (!previous) return business
    business.logoRef = null
    business.logoMimeType = null
    await business.save()
    await this.forget(previous)

    await AuditLoggerService.record({
      actorType: actor.type,
      actorId: actor.id,
      action: 'business.logo_removed',
      resourceType: 'business',
      resourceId: business.id,
      correlationId,
    })
    return business
  }

  static async retrieve(ref: string): Promise<Buffer> {
    // `ref` always comes from our own randomUUID(), read back from the row — never from a
    // request parameter — so no path traversal is possible.
    return readFile(`${STORAGE_DIR}${ref}`)
  }

  /** A replaced file need not linger; one already gone is not an error. */
  private static async forget(ref: string) {
    try {
      await unlink(`${STORAGE_DIR}${ref}`)
    } catch {
      // Already absent.
    }
  }
}
