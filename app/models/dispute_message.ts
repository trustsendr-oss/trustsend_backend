import { DateTime } from 'luxon'
import { BaseModel, column, afterCreate } from '@adonisjs/lucid/orm'
import { Realtime } from '#services/realtime/realtime'
import Dispute from '#models/dispute'

/**
 * Un message dans le fil d'une réclamation.
 *
 * Immuable : pas de colonne `updated_at`, et rien ne permet de réécrire un message. Un échange
 * avec le support est une trace ; la retoucher après coup lui retirerait sa valeur.
 */
export default class DisputeMessage extends BaseModel {
  static table = 'dispute_messages'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare disputeId: string

  @column()
  declare authorType: 'user' | 'agent' | 'internal_user'

  @column()
  declare authorId: number

  @column()
  declare body: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  /*
   * Realtime: a new message in the thread (from support, or the user's other device) shows up
   * on the dispute screen once it commits.
   */
  @afterCreate()
  static async announceMessage(row: DisputeMessage) {
    const dispute = await Dispute.find(row.disputeId, row.$trx ? { client: row.$trx } : undefined)
    if (!dispute || dispute.raisedByType !== 'user') return
    Realtime.toUserForRow(row, dispute.raisedById, { type: 'dispute.updated', id: dispute.id })
  }
}
