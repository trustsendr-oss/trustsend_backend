import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Converts plans.features from a flat string array (`["mobile_money.deposits", ...]`, meaning
 * "unlimited access to this feature") to a map keyed by feature, whose value is either `true`
 * (unrestricted — preserves existing behavior for every row this migration touches) or a
 * restriction object (`{ currencies: [...], countries: [...] }`). This is what lets a plan grant
 * a feature only for specific currencies/countries instead of all-or-nothing — see
 * app/models/plan.ts hasFeature() and business_plan_middleware.ts.
 *
 * Pure data transform, no column type change needed: `features` was already jsonb, and a JSON
 * object is just as valid there as a JSON array.
 */
export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE ${this.tableName}
        SET features = COALESCE(
          (SELECT jsonb_object_agg(elem, 'true'::jsonb) FROM jsonb_array_elements_text(features) AS elem),
          '{}'::jsonb
        )
        WHERE jsonb_typeof(features) = 'array'
      `)
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE ${this.tableName}
        SET features = COALESCE(
          (SELECT jsonb_agg(k) FROM jsonb_object_keys(features) AS k),
          '[]'::jsonb
        )
        WHERE jsonb_typeof(features) = 'object'
      `)
    })
  }
}
