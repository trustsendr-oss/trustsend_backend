import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * An offer granting the capabilities a microfinance institution needs.
 *
 * `businesses.kind` says what an institution IS; the plan says what it may SELL. Keeping the two
 * apart is what lets a bank later take the same feature set without inheriting anything else, and
 * what lets one IMF run savings while another also runs credit.
 *
 * None of these keys gates a route yet — nothing consumes them until the savings and credit
 * endpoints exist. They are seeded now so those phases only have to hang
 * middleware.businessPlan('lending.credit') on a route, with the offer already priced and
 * assignable from the admin.
 *
 * Price and maintenance are left at zero deliberately: what an institution pays is a commercial
 * decision per contract, made by staff in the admin, not a number frozen into a migration.
 */
export default class extends BaseSchema {
  protected tableName = 'plans'

  async up() {
    this.defer(async (db) => {
      const existing = await db.from(this.tableName).where('code', 'imf_standard').first()
      if (existing) return

      await db.table(this.tableName).insert({
        code: 'imf_standard',
        name: 'IMF Standard',
        description:
          'Savings, credit and counter operations for a microfinance institution, plus the wallet and webhook access every partner gets.',
        features: JSON.stringify({
          'savings.accounts': true,
          'lending.credit': true,
          'branch.operations': true,
          'webhooks': true,
          'wallet.multi_currency': true,
        }),
        status: 'active',
        price: 0,
        maintenance_price: 0,
        currency_code: 'USD',
        created_at: new Date(),
        updated_at: new Date(),
      })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.from(this.tableName).where('code', 'imf_standard').delete()
    })
  }
}
