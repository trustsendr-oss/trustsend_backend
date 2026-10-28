import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Where a card top-up stands:
 *
 * - `created`         the checkout page is ready, nothing entered yet
 * - `authenticating`  the card is tokenised, 3DS device data collection is running
 * - `challenge`       the issuer asked the cardholder for a code (OTP)
 * - `charging`        the charge was sent: the ledger row exists from here on
 * - `completed`       credited to the wallet
 * - `failed`          declined (3DS or charge), nothing credited
 * - `expired`         abandoned before any charge
 *
 * See migration 1800000000043 for why this is not a ledger_transactions row.
 */
export type CardDepositStatus =
  'created' | 'authenticating' | 'challenge' | 'charging' | 'completed' | 'failed' | 'expired'

export const TERMINAL_CARD_DEPOSIT_STATUSES: CardDepositStatus[] = [
  'completed',
  'failed',
  'expired',
]

export default class CardDepositSession extends BaseModel {
  static table = 'card_deposit_sessions'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare userId: number

  @column()
  declare walletId: number

  /** Hundredths of the currency. Serialised as a string: JSON has no bigint. */
  @column({ serialize: (value: bigint) => value.toString() })
  declare amount: bigint

  @column()
  declare currencyCode: string

  @column()
  declare merchantReference: string

  @column()
  declare gatewayTransactionUuid: string | null

  @column({ serializeAs: null })
  declare checkoutTokenHash: string

  @column()
  declare status: CardDepositStatus

  @column()
  declare authenticationTransactionId: string | null

  @column()
  declare ledgerTransactionId: string | null

  @column()
  declare cardScheme: string | null

  // Explicit: the snake-case naming strategy would look for `card_last_4`.
  @column({ columnName: 'card_last4' })
  declare cardLast4: string | null

  @column()
  declare cardIssuer: string | null

  @column()
  declare cardBinCountry: string | null

  @column()
  declare failureCode: string | null

  @column()
  declare failureMessage: string | null

  @column()
  declare metadata: Record<string, any>

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  get isTerminal(): boolean {
    return TERMINAL_CARD_DEPOSIT_STATUSES.includes(this.status)
  }
}
