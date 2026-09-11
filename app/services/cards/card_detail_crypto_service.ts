import { createDecipheriv } from 'node:crypto'
import { SecretsProvider } from '#services/security/secrets_provider'
import type { SecureDetailsEnvelope } from '#services/cards/card_provider'

export interface DecryptedCardDetails {
  number: string
  ccv: string
  expiry: string
}

export class CardDetailDecryptionException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CardDetailDecryptionException'
  }
}

/**
 * Decrypts the `secure_details` envelope Payscribe returns instead of plaintext card
 * number/CVV/expiry (see https://docs.payscribe.co/ — Card Detail Encryption). AES-256-GCM,
 * keyed by our Merchant Hash Key (hex, 32 raw bytes once decoded).
 *
 * Deliberately never persisted: callers must return this straight to the authenticated
 * cardholder's own request and never write it to the DB, logs, or audit trail — see
 * card_service.ts getCardDetails()/createCard().
 */
export class CardDetailCryptoService {
  static decrypt(envelope: SecureDetailsEnvelope): DecryptedCardDetails {
    try {
      const key = Buffer.from(SecretsProvider.getPayscribeMerchantHashKey(), 'hex')
      const iv = Buffer.from(envelope.iv, 'base64')
      const tag = Buffer.from(envelope.tag, 'base64')
      const data = Buffer.from(envelope.data, 'base64')

      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      decipher.setAAD(Buffer.from(envelope.aad, 'utf8'))

      const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
      return JSON.parse(plaintext.toString('utf8')) as DecryptedCardDetails
    } catch (error) {
      const err = error as Error
      throw new CardDetailDecryptionException(`Failed to decrypt card details: ${err.message}`)
    }
  }
}
