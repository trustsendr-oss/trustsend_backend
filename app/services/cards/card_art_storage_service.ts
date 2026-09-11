import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const STORAGE_DIR = fileURLToPath(new URL('../../../storage/card_art/', import.meta.url))

export const ALLOWED_CARD_ART_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const
export const MAX_CARD_ART_SIZE_BYTES = 2 * 1024 * 1024 // 2 Mo

export class InvalidCardArtException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCardArtException'
  }
}

/**
 * Stocke le visuel d'une catégorie de carte.
 *
 * Volontairement **non chiffré**, contrairement à KycDocumentStorageService : c'est une image de
 * catalogue, pas une pièce d'identité. La chiffrer coûterait un déchiffrement à chaque affichage
 * et empêcherait toute mise en cache, pour protéger quelque chose qui est fait pour être vu.
 *
 * Le nom de fichier est un UUID sans lien avec l'identifiant de la catégorie : rien ne doit
 * pouvoir être énuméré depuis l'extérieur, même si l'accès en lecture est public.
 */
export class CardArtStorageService {
  /**
   * Écrit l'image et renvoie sa référence.
   *
   * Le type est déduit des octets eux-mêmes, jamais de l'en-tête annoncé par le client : un
   * fichier peut prétendre être une image sans en être une, et c'est ce type qui sera renvoyé
   * plus tard dans `Content-Type`.
   */
  static async store(fileBuffer: Buffer): Promise<{ ref: string; mimeType: string }> {
    if (fileBuffer.byteLength > MAX_CARD_ART_SIZE_BYTES) {
      throw new InvalidCardArtException('Card art must be 2 MB or smaller')
    }

    const mimeType = sniffImageMimeType(fileBuffer)
    if (!mimeType) {
      throw new InvalidCardArtException('Card art must be a PNG, JPEG or WebP image')
    }

    await mkdir(STORAGE_DIR, { recursive: true })
    const ref = randomUUID()
    await writeFile(`${STORAGE_DIR}${ref}`, fileBuffer)

    return { ref, mimeType }
  }

  static async retrieve(ref: string): Promise<Buffer> {
    // `ref` vient toujours d'un randomUUID() à nous, relu depuis la ligne en base — jamais d'un
    // paramètre de requête : aucun risque de remontée de chemin.
    return readFile(`${STORAGE_DIR}${ref}`)
  }

  /**
   * Efface un visuel remplacé. L'absence du fichier n'est pas une erreur : le but est qu'il ne
   * soit plus là, et échouer ferait perdre le remplacement déjà enregistré en base.
   */
  static async remove(ref: string): Promise<void> {
    try {
      await unlink(`${STORAGE_DIR}${ref}`)
    } catch {
      // Déjà absent : rien à faire.
    }
  }
}

/** Reconnaît le format d'après ses octets d'en-tête. `null` si ce n'en est aucun. */
export function sniffImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  // WebP : « RIFF » .... « WEBP »
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}
