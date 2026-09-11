import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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
}
