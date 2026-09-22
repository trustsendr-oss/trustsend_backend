import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TellerSession from '#models/teller_session'

/**
 * One currency's drawer within a shift.
 *
 * A counter takes USD and CDF at the same window, and each is reconciled on its own: a surplus in
 * one never offsets a shortfall in the other, because they are different piles of notes.
 *
 * `expectedCash` and `variance` are frozen at close rather than recomputed on read. A shift is a
 * statement about a moment — what was counted, against what was owed at that moment — and a later
 * correction elsewhere must not silently rewrite a variance someone already signed off.
 */
export default class TellerSessionBalance extends BaseModel {
  static table = 'teller_session_balances'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare tellerSessionId: number

  @column()
  declare currencyCode: string

  /** Notes in the drawer at open, as declared by the teller. */
  @column()
  declare openingCash: bigint

  /** Notes counted at close; null while the shift is open. */
  @column()
  declare countedCash: bigint | null

  /** Opening plus the gross of every cash movement booked to the shift. */
  @column()
  declare expectedCash: bigint | null

  /** counted − expected. Negative is a shortfall, positive a surplus. */
  @column()
  declare variance: bigint | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => TellerSession, { foreignKey: 'tellerSessionId' })
  declare session: BelongsTo<typeof TellerSession>
}
