import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { SecretsProvider } from '#services/security/secrets_provider'

/**
 * CryptoService: Application-level encryption for sensitive fields (PII, KYC documents, etc.)
 *
 * Uses AES-256-GCM for authenticated encryption.
 * The data encryption key (DEK) is stored in the database (encrypted).
 * The master encryption key (MEK) is managed by the secret provider (vault/env).
 *
 * This is "defence in depth": a DB compromise alone does not expose plaintext,
 * as sensitive fields are encrypted with a key derived from the MEK.
 */
export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm'
  private static readonly IV_LENGTH = 16
  private static readonly TAG_LENGTH = 16
  // Fixed application-specific context for key derivation (not a secret by itself — the
  // security comes entirely from the master key). Changing this invalidates all ciphertext.
  private static readonly KDF_SALT = 'tumaplus-crypto-service-v1'
  private static derivedKey: Buffer | null = null

  /**
   * Derive a proper 256-bit AES key from the master secret via scrypt, instead of naively
   * slicing/truncating the raw secret string (which both risks cutting a multi-byte UTF-8
   * character in half and doesn't guarantee 256 bits of real entropy if the secret is short).
   */
  private static getKey(): Buffer {
    if (this.derivedKey) {
      return this.derivedKey
    }
    const masterKey = SecretsProvider.getMasterEncryptionKey()
    if (masterKey.length < 32) {
      throw new Error('Master encryption key must be at least 32 characters (256 bits)')
    }
    this.derivedKey = scryptSync(masterKey, this.KDF_SALT, 32)
    return this.derivedKey
  }

  /**
   * Encrypt a sensitive string value
   * Returns: {iv, authTag, encrypted} encoded as base64, suitable for storage in a BLOB/TEXT field
   */
  static encrypt(plaintext: string): string {
    const key = this.getKey()

    // Generate random IV for each encryption
    const iv = randomBytes(this.IV_LENGTH)

    // Create cipher and encrypt
    const cipher = createCipheriv(this.ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

    // Get authentication tag
    const authTag = cipher.getAuthTag()

    // Return: iv + authTag + encrypted, all base64 encoded
    const combined = Buffer.concat([iv, authTag, encrypted])
    return combined.toString('base64')
  }

  /**
   * Decrypt a previously encrypted value
   * Expects the same format returned by encrypt()
   */
  static decrypt(encrypted: string): string {
    try {
      const key = this.getKey()

      const combined = Buffer.from(encrypted, 'base64')

      // Extract IV, authTag, and ciphertext
      const iv = combined.slice(0, this.IV_LENGTH)
      const authTag = combined.slice(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH)
      const ciphertext = combined.slice(this.IV_LENGTH + this.TAG_LENGTH)

      // Create decipher and decrypt
      const decipher = createDecipheriv(this.ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8')

      return plaintext
    } catch (error) {
      throw new Error(`Failed to decrypt value: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Encrypt raw binary data (KYC document scans, etc.) — same AES-256-GCM scheme as encrypt(),
   * but operates directly on a Buffer instead of round-tripping through a UTF-8/base64 string,
   * which would both bloat binary payloads and can corrupt non-UTF-8 bytes.
   */
  static encryptBuffer(plaintext: Buffer): Buffer {
    const key = this.getKey()
    const iv = randomBytes(this.IV_LENGTH)

    const cipher = createCipheriv(this.ALGORITHM, key, iv)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted])
  }

  /** Inverse of encryptBuffer(). */
  static decryptBuffer(encrypted: Buffer): Buffer {
    const key = this.getKey()

    const iv = encrypted.subarray(0, this.IV_LENGTH)
    const authTag = encrypted.subarray(this.IV_LENGTH, this.IV_LENGTH + this.TAG_LENGTH)
    const ciphertext = encrypted.subarray(this.IV_LENGTH + this.TAG_LENGTH)

    const decipher = createDecipheriv(this.ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  /**
   * Hash a value using the built-in hash service (for passwords, not for encryption)
   * Use this for one-way hashing (passwords, API tokens, etc.)
   */
  static async hashPassword(password: string): Promise<string> {
    // Import dynamically to avoid circular dependency
    const hash = (await import('@adonisjs/core/services/hash')).default
    return hash.make(password)
  }

  /**
   * Verify a hashed password
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const hashService = (await import('@adonisjs/core/services/hash')).default
    return hashService.verify(hash, password)
  }
}
