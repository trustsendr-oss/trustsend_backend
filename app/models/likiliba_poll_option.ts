import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One choice of a poll posted in a likiliba conversation. */
export default class LikilibaPollOption extends BaseModel {
  static table = 'likiliba_poll_options'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare messageId: number

  @column()
  declare label: string

  @column()
  declare position: number
}
