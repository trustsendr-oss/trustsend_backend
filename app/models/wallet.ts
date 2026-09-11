import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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

  @column()
  declare status: 'active' | 'frozen' | 'closed'

  @column()
  declare lockVersion: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
