import { DateTime } from 'luxon'
import { BaseModel, column, scope } from '@adonisjs/lucid/orm'

export default class Wallet extends BaseModel {
  static table = 'wallets'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare agentId: number | null

  @column()
  declare businessId: number | null

  @column()
  declare ledgerAccountId: number

  @column()
  declare currencyCode: string

  @column()
  declare balanceCache: bigint

  @column()
  declare perTransactionLimit: bigint | null

  @column()
  declare dailyLimit: bigint | null

  @column()
  declare monthlyLimit: bigint | null

  /**
   * What this wallet is for. `primary` is the one an owner spends from and the only one a money
   * path may resolve implicitly; everything else holds money that is deliberately not spendable
   * — savings placed with an institution, collateral, escrow.
   *
   * Only one primary exists per owner and currency (partial unique indexes, see migration
   * 1800000000002). Any query that resolves "the" wallet from an owner plus a currency therefore
   * MUST narrow on this, or it will eventually pick up someone's locked savings and spend them.
   * Use the `primary` scope below rather than repeating the literal.
   */
  @column()
  declare purpose: 'primary' | 'escrow' | 'savings' | 'collateral'

  @column()
  declare status: 'active' | 'frozen' | 'closed'

  @column()
  declare lockVersion: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Narrows to the wallet an owner actually spends from. Every resolver that turns an owner plus
   * a currency into a single wallet applies this — see the `purpose` column for why.
   */
  static primary = scope((query) => {
    query.where('purpose', 'primary')
  })
}
