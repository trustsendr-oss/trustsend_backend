import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CryptoDepositAddress from '#models/crypto_deposit_address'

/**
 * An on-chain transfer to one of our deposit addresses, as reported by Alchemy and then checked
 * against the chain itself. See CryptoDepositService for the life cycle.
 */
export default class CryptoDeposit extends BaseModel {
  static table = 'crypto_deposits'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare network: string

  @column()
  declare txHash: string

  @column()
  declare logIndex: number

  @column()
  declare tokenSymbol: string

  @column()
  declare contractAddress: string

  @column()
  declare toAddress: string

  @column()
  declare fromAddress: string | null

  /** Token base units (6 decimals for the stablecoins we accept), kept as a string. */
  @column()
  declare rawAmount: string

  /** BIGINT, parsed as a native bigint at boot (see start/pg_types.ts). */
  @column()
  declare blockNumber: bigint | null

  @column()
  declare confirmations: number

  @column()
  declare depositAddressId: number

  @column()
  declare status: 'pending' | 'credited' | 'rejected'

  @column()
  declare rejectReason: string | null

  @column()
  declare ledgerTransactionId: string | null

  @column.dateTime()
  declare creditedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => CryptoDepositAddress, { foreignKey: 'depositAddressId' })
  declare depositAddress: BelongsTo<typeof CryptoDepositAddress>
}
