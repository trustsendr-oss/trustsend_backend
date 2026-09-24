import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Business from '#models/business'
import VaultTransfer from '#models/vault_transfer'

export default class BusinessVault extends BaseModel {
  static table = 'business_vaults'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare businessId: number

  @column()
  declare currencyCode: string

  @column()
  declare name: string

  @column()
  declare balanceCache: bigint

  @column()
  declare maxCapacity: bigint | null

  @column()
  declare status: 'active' | 'locked' | 'closed'

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Business, { foreignKey: 'businessId' })
  declare business: BelongsTo<typeof Business>

  @hasMany(() => VaultTransfer, { foreignKey: 'vaultId' })
  declare transfers: HasMany<typeof VaultTransfer>
}
