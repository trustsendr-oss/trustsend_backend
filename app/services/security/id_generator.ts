import { randomInt } from 'node:crypto'

export class IdGenerator {
  /**
   * Generate alphanumeric ID (like: TXN-A7K2M9X1)
   * Format: PREFIX-XXXXXXXX (8 alphanumeric characters)
   *
   * Uses a CSPRNG (crypto.randomInt), not Math.random(): these IDs are used as the primary
   * key for resources reachable over the API, so they must not be guessable.
   */
  static generateId(prefix: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(randomInt(0, chars.length))
    }
    return `${prefix}-${result}`
  }

  /**
   * Transaction ID: TXN-XXXXXXXX
   */
  static generateTransactionId(): string {
    return this.generateId('TXN')
  }

  /**
   * Request ID: REQ-XXXXXXXX
   */
  static generateRequestId(): string {
    return this.generateId('REQ')
  }

  /**
   * Dispute ID: DSP-XXXXXXXX
   */
  static generateDisputeId(): string {
    return this.generateId('DSP')
  }

  /**
   * KYC ID: KYC-XXXXXXXX
   */
  static generateKycId(): string {
    return this.generateId('KYC')
  }

  /**
   * Wallet ID: WAL-XXXXXXXX
   */
  static generateWalletId(): string {
    return this.generateId('WAL')
  }

  /**
   * Ledger Entry ID: LDG-XXXXXXXX
   */
  static generateLedgerId(): string {
    return this.generateId('LDG')
  }

  /**
   * Generate a 9-digit numeric code (like a phone number) — used as the user's public account
   * identifier for P2P transfers and agent lookups. CSPRNG (crypto.randomInt), not Math.random():
   * this value is looked up directly by other users, so it must not be predictable.
   */
  static generateNumericCode(): string {
    return randomInt(100000000, 1000000000).toString()
  }

  /**
   * Verify format is alphanumeric ID
   */
  static isValidId(id: string): boolean {
    return /^[A-Z]+-[A-Z0-9]{8}$/.test(id)
  }

  /**
   * Extract prefix from ID
   */
  static getPrefix(id: string): string | null {
    const match = id.match(/^([A-Z]+)-/)
    return match ? match[1] : null
  }
}
