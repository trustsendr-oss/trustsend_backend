/**
 * Money Value Object
 *
 * Immutable representation of a monetary amount in a specific currency.
 * Enforces:
 * - Amounts are always bigint (never float/number — prevents floating-point errors)
 * - Currency is always specified
 * - Operations refuse to mix currencies implicitly
 *
 * This is used throughout the system for any financial calculation.
 */
export class Money {
  private readonly _amount: bigint
  private readonly _currencyCode: string

  constructor(amount: bigint | number | string, currencyCode: string = 'USD') {
    // Normalize to bigint
    let normalizedAmount: bigint
    if (typeof amount === 'bigint') {
      normalizedAmount = amount
    } else if (typeof amount === 'string') {
      try {
        normalizedAmount = BigInt(amount)
      } catch (e) {
        throw new Error(`Invalid amount: ${amount} is not a valid integer`)
      }
    } else if (typeof amount === 'number') {
      if (!Number.isInteger(amount)) {
        throw new Error(
          `Invalid amount: ${amount} has decimal places. Use integers only (smallest currency unit).`
        )
      }
      normalizedAmount = BigInt(Math.trunc(amount))
    } else {
      throw new Error(`Invalid amount type: ${typeof amount}`)
    }

    this._amount = normalizedAmount
    this._currencyCode = currencyCode
  }

  // Getters
  get amount(): bigint {
    return this._amount
  }

  get currencyCode(): string {
    return this._currencyCode
  }

  /**
   * Return amount as a plain number (use with caution — loses precision for large amounts)
   */
  get toNumber(): number {
    return Number(this._amount)
  }

  /**
   * Return amount as a formatted string
   */
  get toFormatted(): string {
    return `${this._currencyCode} ${this._amount}`
  }

  // Operations
  add(other: Money): Money {
    if (other.currencyCode !== this._currencyCode) {
      throw new Error(
        `Cannot add ${other.currencyCode} to ${this._currencyCode}: mixing currencies requires explicit conversion`
      )
    }
    return new Money(this._amount + other._amount, this._currencyCode)
  }

  subtract(other: Money): Money {
    if (other.currencyCode !== this._currencyCode) {
      throw new Error(
        `Cannot subtract ${other.currencyCode} from ${this._currencyCode}: mixing currencies requires explicit conversion`
      )
    }
    const result = this._amount - other._amount
    if (result < 0n) {
      throw new Error(`Cannot subtract: result would be negative (${result})`)
    }
    return new Money(result, this._currencyCode)
  }

  /**
   * Check if this amount is zero
   */
  isZero(): boolean {
    return this._amount === 0n
  }

  /**
   * Check if this amount is positive
   */
  isPositive(): boolean {
    return this._amount > 0n
  }

  /**
   * Check if this amount is greater than another
   */
  isGreaterThan(other: Money): boolean {
    if (other.currencyCode !== this._currencyCode) {
      throw new Error('Cannot compare different currencies')
    }
    return this._amount > other._amount
  }

  /**
   * Check if this amount is less than another
   */
  isLessThan(other: Money): boolean {
    if (other.currencyCode !== this._currencyCode) {
      throw new Error('Cannot compare different currencies')
    }
    return this._amount < other._amount
  }

  /**
   * Check equality
   */
  equals(other: Money): boolean {
    return this._amount === other._amount && this._currencyCode === other._currencyCode
  }

  /**
   * String representation
   */
  toString(): string {
    return this.toFormatted
  }
}
