import env from '#start/env'

/**
 * SecretsProvider abstracts secret management.
 *
 * In development: returns values directly from env vars
 * In production: would integrate with a KMS/Vault service (HashiCorp Vault, AWS Secrets Manager, etc.)
 *
 * For now, it's a simple wrapper that allows future migration to a vault without
 * changing the calling code.
 */
export class SecretsProvider {
  /**
   * Get a secret value (encryption key, API key, database password, etc.)
   * @param secretName The name/key of the secret
   * @param defaultValue Optional default if secret not found
   * @returns The secret value
   */
  static getSecret(secretName: string, defaultValue?: string): string {
    const value = env.get(secretName)
    if (!value && defaultValue) {
      return defaultValue
    }
    if (!value) {
      throw new Error(`Secret not configured: ${secretName}`)
    }
    return value
  }

  /**
   * Get the master encryption key (used by CryptoService)
   */
  static getMasterEncryptionKey(): string {
    // In production, this would be fetched from a vault with rotation support
    return this.getSecret('ENCRYPTION_KEY')
  }

  /**
   * Check if a vault/KMS is enabled
   */
  static isVaultEnabled(): boolean {
    const vaultEnabled = env.get('VAULT_ENABLED')
    return vaultEnabled === 'true' || vaultEnabled === true
  }

  /**
   * Get the PawaPay API bearer token
   */
  static getPawaPayApiToken(): string {
    return this.getSecret('PAWAPAY_API_TOKEN')
  }

  /**
   * Get the Payscribe API bearer token
   */
  static getPayscribeApiToken(): string {
    return this.getSecret('PAYSCRIBE_API_TOKEN')
  }

  /**
   * Get the Payscribe Merchant Hash Key — decrypts `secure_details` on card responses
   * (see CardDetailCryptoService). 64-char hex, one per environment.
   */
  static getPayscribeMerchantHashKey(): string {
    return this.getSecret('PAYSCRIBE_MERCHANT_HASH_KEY')
  }

  /**
   * Get the secret used to verify Payscribe's X-Payscribe-Signature webhook header.
   */
  static getPayscribeWebhookSecret(): string {
    return this.getSecret('PAYSCRIBE_WEBHOOK_SECRET')
  }
}
