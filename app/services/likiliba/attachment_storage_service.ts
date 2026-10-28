import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { sniffImageMimeType } from '#services/cards/card_art_storage_service'
import { objectStore } from '#services/storage/object_store'

export const LOCAL_ATTACHMENTS_DIR = fileURLToPath(
  new URL('../../../storage/likiliba_attachments/', import.meta.url)
)

/** The disk in development, the `likiliba/` prefix of the S3 bucket when configured. */
const store = objectStore('likiliba', LOCAL_ATTACHMENTS_DIR)

export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024 // 8 Mo
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 Mo, under the 20 Mo multipart limit
/** About 5 minutes of voice at 64 kbit/s, what the app records, with room to spare. */
export const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024
export const MAX_AUDIO_DURATION_MS = 5 * 60 * 1000

/** What a member can attach as a file, and the type it is served back with. */
const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
}

export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

export class InvalidAttachmentException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidAttachmentException'
  }
}

/**
 * The type of a voice message, read from its first bytes: MP4/M4A or 3GP (`ftyp` box, what
 * iOS and Android record), Ogg, WebM (the web), or MP3. Null for anything else.
 */
export function sniffAudioMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return buffer.toString('ascii', 8, 11) === '3gp' ? 'audio/3gpp' : 'audio/mp4'
  }
  if (buffer.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg'
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) return 'audio/webm'
  if (buffer.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg'
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  return null
}

/**
 * The bytes must be what the extension claims: a PDF starts with `%PDF`, Office files are ZIP
 * (`PK`) or the older OLE container, text has no NUL byte. Anything else is refused rather than
 * stored under a misleading name.
 */
function fileMatches(extension: string, buffer: Buffer): boolean {
  switch (extension) {
    case 'pdf':
      return buffer.toString('ascii', 0, 4) === '%PDF'
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
    case 'doc':
    case 'xls':
    case 'ppt':
      return buffer.length >= 8 && buffer.readUInt32BE(0) === 0xd0cf11e0
    case 'txt':
    case 'csv':
      return !buffer.includes(0)
    default:
      return false
  }
}

/**
 * Photos and files sent in a likiliba conversation.
 *
 * Served only to the members of the group (LikilibasController.messageAttachment), never
 * publicly — on disk or in a private bucket, see object_store.ts; the file name is a UUID unrelated to the group, the message or the name the
 * member gave it. The type sent back as Content-Type is decided here, from the bytes, never from
 * what the client announced.
 */
export class LikilibaAttachmentStorageService {
  static async storeImage(buffer: Buffer) {
    if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      throw new InvalidAttachmentException('A photo must be 8 MB or smaller')
    }
    const mimeType = sniffImageMimeType(buffer)
    if (!mimeType) {
      throw new InvalidAttachmentException('A photo must be a PNG, JPEG or WebP image')
    }
    return { ref: await this.write(buffer, mimeType), mimeType, size: buffer.byteLength }
  }

  static async storeAudio(buffer: Buffer) {
    if (buffer.byteLength > MAX_AUDIO_SIZE_BYTES) {
      throw new InvalidAttachmentException('A voice message must be 5 MB or smaller')
    }
    const mimeType = sniffAudioMimeType(buffer)
    if (!mimeType) {
      throw new InvalidAttachmentException('A voice message must be M4A, 3GP, MP3, Ogg or WebM')
    }
    return { ref: await this.write(buffer, mimeType), mimeType, size: buffer.byteLength }
  }

  static async storeFile(buffer: Buffer, extension: string) {
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new InvalidAttachmentException('A file must be 15 MB or smaller')
    }
    const ext = extension.toLowerCase()
    const imageType = sniffImageMimeType(buffer)
    const mimeType = (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
      ? imageType
      : FILE_TYPES[ext] && fileMatches(ext, buffer)
        ? FILE_TYPES[ext]
        : null
    if (!mimeType) {
      throw new InvalidAttachmentException('This file type is not accepted, or the file is damaged')
    }
    return { ref: await this.write(buffer, mimeType), mimeType, size: buffer.byteLength }
  }

  static async retrieve(ref: string): Promise<Buffer> {
    // `ref` always comes from our own randomUUID(), read back from the message row — never from
    // a request parameter: no path traversal possible.
    return store.get(ref)
  }

  /** Undoes a store whose message could not be saved. A missing file is not an error. */
  static async remove(ref: string): Promise<void> {
    await store.delete(ref)
  }

  private static async write(buffer: Buffer, mimeType: string) {
    const ref = randomUUID()
    await store.put(ref, buffer, mimeType)
    return ref
  }
}
