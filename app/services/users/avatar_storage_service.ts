import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { sniffImageMimeType } from '#services/cards/card_art_storage_service'

const STORAGE_DIR = fileURLToPath(new URL('../../../storage/avatars/', import.meta.url))

export const ALLOWED_AVATAR_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024 // 2 Mo

export class InvalidAvatarException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidAvatarException'
  }
}

/**
 * Stores account holders' profile photos.
 *
 * Not encrypted, unlike KycDocumentStorageService: a profile photo is something its owner chose
 * to show, not an identity document. It is served to its owner (ProfileController.avatar) and to
 * the members of a likiliba they belong to (LikilibasController.memberAvatar), never publicly; the
 * file name is a UUID with no link to the user id, so nothing can be enumerated from outside.
 */
export class AvatarStorageService {
  /**
   * Writes the image and returns its reference. The type comes from the bytes themselves, never
   * from the header the client announced: it is what will later be sent back as Content-Type.
   */
  static async store(fileBuffer: Buffer): Promise<{ ref: string; mimeType: string }> {
    if (fileBuffer.byteLength > MAX_AVATAR_SIZE_BYTES) {
      throw new InvalidAvatarException('Profile photo must be 2 MB or smaller')
    }

    const mimeType = sniffImageMimeType(fileBuffer)
    if (!mimeType) {
      throw new InvalidAvatarException('Profile photo must be a PNG, JPEG or WebP image')
    }

    await mkdir(STORAGE_DIR, { recursive: true })
    const ref = randomUUID()
    await writeFile(`${STORAGE_DIR}${ref}`, fileBuffer)

    return { ref, mimeType }
  }

  static async retrieve(ref: string): Promise<Buffer> {
    // `ref` always comes from our own randomUUID(), read back from the users row — never from a
    // request parameter: no path traversal possible.
    return readFile(`${STORAGE_DIR}${ref}`)
  }

  /**
   * Deletes a replaced or removed photo. A missing file is not an error: the goal is that it is
   * gone, and failing here would lose the change already saved on the row.
   */
  static async remove(ref: string): Promise<void> {
    try {
      await unlink(`${STORAGE_DIR}${ref}`)
    } catch {
      // Already gone: nothing to do.
    }
  }
}
