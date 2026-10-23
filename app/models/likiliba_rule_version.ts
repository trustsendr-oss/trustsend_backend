import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * One version of a group's rules, frozen. Members sign a version by its hash; a later edit
 * creates a new version rather than altering what someone already accepted.
 */
export default class LikilibaRuleVersion extends BaseModel {
  static table = 'likiliba_rule_versions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare likilibaId: number

  @column()
  declare version: number

  /** Structured terms plus the plain-language clauses shown to members. */
  @column()
  declare rules: Record<string, any>

  @column()
  declare rulesHash: string

  @column()
  declare createdByUserId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
