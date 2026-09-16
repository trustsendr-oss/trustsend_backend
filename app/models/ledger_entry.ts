import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LedgerEntry extends BaseModel {
  static table = 'ledger_entries'

  @column({ isPrimary: true })
  declare id: string // Alphanumérique: LDG-XXXXXXXX

  @column()
  declare ledgerTransactionId: string // FK to ledger_transactions.id (TXN-XXXXXXXX)

  @column()
  declare ledgerAccountId: number

  @column()
  declare direction: 'debit' | 'credit'

  @column()
  declare amount: bigint

  @column()
  declare currencyCode: string

  @column()
  declare balanceAfter: bigint

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
