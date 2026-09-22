import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LedgerTransaction extends BaseModel {
  static table = 'ledger_transactions'

  @column({ isPrimary: true })
  declare id: string // Alphanumérique: TXN-XXXXXXXX

  @column()
  declare uuid: string

  @column()
  declare type: string

  @column()
  declare status:
    | 'initiated'
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'reversed'
    | 'reserved'
    | 'settled'
    | 'cancelled'
    | 'rejected'

  @column()
  declare idempotencyKey: string | null

  @column()
  declare correlationId: string

  @column()
  declare initiatedByType: 'user' | 'agent' | 'system' | 'internal_user' | 'business'

  @column()
  declare initiatedById: number

  @column()
  declare reversalOfTransactionId: string | null

  @column()
  declare description: string | null

  @column()
  declare metadata: Record<string, any> | null

  @column()
  declare provider: string | null

  @column()
  declare providerReferenceId: string | null

  // Display/filter convenience only, populated by the creating service — never a source of truth
  // for a balance or accounting calculation. That's always ledger_entries via LedgerService. See
  // migration 1793400000000_add_payment_detail_columns_to_ledger_transactions.ts.
  @column()
  declare amount: bigint | null

  @column()
  declare currencyCode: string | null

  @column()
  declare paymentMethod: string | null

  @column()
  declare paymentChannel: string | null

  @column()
  declare counterpartyPhone: string | null

  @column()
  declare fee: bigint | null

  @column()
  declare failureReason: string | null

  /** Links a mobile money "tracking" row to its "posted" double-entry row, and vice versa. */
  @column()
  declare relatedTransactionId: string | null

  /**
   * The counter shift this passed through, on the TRACKING row only.
   *
   * A counter movement produces two rows — this tracking row and the double-entry transaction
   * LedgerService.postTransaction creates — and both carry type `cash_in`/`cash_out` and the same
   * gross amount. Stamping only one of them is what keeps a shift's expected cash from counting
   * every movement twice; see TellerSessionService.
   */
  @column()
  declare tellerSessionId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime()
  declare reversedAt: DateTime | null
}
