import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import BusinessVault from '#models/business_vault'
import TellerSession from '#models/teller_session'
import BusinessStaff from '#models/business_staff'

export type VaultTransferType = 'replenishment' | 'sweep'
export type VaultTransferStatus = 'requested' | 'approved' | 'rejected' | 'completed'

export default class VaultTransfer extends BaseModel {
  static table = 'vault_transfers'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare vaultId: number

  @column()
  declare tellerSessionId: number

  @column()
  declare transferType: VaultTransferType

  @column()
  declare currencyCode: string

  @column()
  declare amount: bigint

  @column()
  declare initiatedByStaffId: number

  @column()
  declare approvedByStaffId: number | null

  @column()
  declare status: VaultTransferStatus

  @column()
  declare notes: string | null

  @column.dateTime()
  declare decidedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => BusinessVault, { foreignKey: 'vaultId' })
  declare vault: BelongsTo<typeof BusinessVault>

  @belongsTo(() => TellerSession, { foreignKey: 'tellerSessionId' })
  declare tellerSession: BelongsTo<typeof TellerSession>

  @belongsTo(() => BusinessStaff, { foreignKey: 'initiatedByStaffId' })
  declare initiator: BelongsTo<typeof BusinessStaff>

  @belongsTo(() => BusinessStaff, { foreignKey: 'approvedByStaffId' })
  declare approver: BelongsTo<typeof BusinessStaff>
}
