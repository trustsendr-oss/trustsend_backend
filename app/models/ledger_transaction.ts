import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LedgerTransaction extends BaseModel {
  static table = 'ledger_transactions'

  @column({ isPrimary: true })
  declare id: string  // Alphanumérique: TXN-XXXXXXXX

  @column()
  declare uuid: string

  @column()
  declare type: string

  @column()
  declare status: 'initiated' | 'pending' | 'processing' | 'completed' | 'failed' | 'reversed' | 'reserved' | 'settled' | 'cancelled' | 'rejected'

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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime()
  declare reversedAt: DateTime | null
}
