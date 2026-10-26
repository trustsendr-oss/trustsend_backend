import { DateTime } from 'luxon'
import { BaseModel, column, beforeSave, afterSave } from '@adonisjs/lucid/orm'
import { Realtime } from '#services/realtime/realtime'

export type RemittanceStatus =
  | 'held'
  | 'awaiting_payout'
  | 'processing'
  | 'paid'
  | 'cancelled'
  | 'expired'
  | 'rejected'
  | 'failed'

export type RemittancePayoutMethod = 'cash_pickup' | 'wallet' | 'mobile_money'

/** An international transfer into the DRC (see RemittanceService). */
/** Rows whose status changed in the save under way (see the hooks below). */
const statusChanged = new WeakSet<object>()

export default class Remittance extends BaseModel {
  static table = 'remittances'
  static selfAssignPrimaryKey = true

  @column({ isPrimary: true })
  declare id: string

  @column()
  declare senderUserId: number

  @column()
  declare sourceWalletId: number

  @column()
  declare senderCountry: string

  @column()
  declare senderName: string

  @column()
  declare sourceCurrency: string

  @column()
  declare sendAmount: bigint

  @column()
  declare fee: bigint

  @column()
  declare payoutCurrency: string

  @column()
  declare payoutAmount: bigint

  @column()
  declare fxMargin: bigint

  @column()
  declare rate: string | null

  @column()
  declare payoutMethod: RemittancePayoutMethod

  @column()
  declare beneficiaryName: string

  @column()
  declare beneficiaryPhone: string

  @column()
  declare beneficiaryCity: string | null

  @column()
  declare beneficiaryUserId: number | null

  @column()
  declare purpose: string | null

  @column({ serializeAs: null })
  declare pickupCodeHash: string | null

  @column({ serializeAs: null })
  declare pickupCodeEncrypted: string | null

  @column()
  declare verificationFailures: number

  @column()
  declare status: RemittanceStatus

  @column()
  declare holdReason: string | null

  @column()
  declare failureReason: string | null

  @column()
  declare paidByAgentId: number | null

  @column()
  declare beneficiaryIdType: string | null

  @column()
  declare beneficiaryIdNumber: string | null

  @column.dateTime()
  declare paidAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column()
  declare sendTransactionId: string | null

  @column()
  declare payoutTransactionId: string | null

  @column()
  declare refundTransactionId: string | null

  @column()
  declare idempotencyKey: string | null

  @column()
  declare payoutProviderCode: string | null

  @column()
  declare payoutProviderReference: string | null

  @column()
  declare payoutProviderTransactionId: string | null

  @column.dateTime()
  declare dispatchedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /*
   * Realtime: the owner hears about a status change once it commits, whichever code path made it
   * (agent, support, scheduled job, provider callback). See app/services/realtime/realtime.ts.
   */
  @beforeSave()
  static noteStatusChange(row: Remittance) {
    if (row.$isNew || 'status' in row.$dirty) statusChanged.add(row)
  }

  @afterSave()
  static announceStatusChange(row: Remittance) {
    if (!statusChanged.delete(row)) return
    Realtime.toUserForRow(row, row.senderUserId, {
      type: 'remittance.updated',
      id: row.id,
      status: row.status,
    })
  }
}
