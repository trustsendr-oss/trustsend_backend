import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/orm'
import LedgerEntry from '#models/ledger_entry'

/**
 * Ledger Account — represents an accounting account in the double-entry bookkeeping system
 */
export default class LedgerAccount extends BaseModel {
  /**
   * Define table name
   */
  static table = 'ledger_accounts'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare name: string

  @column()
  declare accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

  @column()
  declare ownerType: 'user_wallet' | 'agent_wallet' | 'business_wallet' | 'platform_internal'

  @column()
  declare ownerId: number | null

  @column()
  declare currencyCode: string

  @column()
  declare status: 'active' | 'closed'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @hasMany(() => LedgerEntry, { foreignKey: 'ledgerAccountId' })
  declare entries: HasMany<typeof LedgerEntry>
}
