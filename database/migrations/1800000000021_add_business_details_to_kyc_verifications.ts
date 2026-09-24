import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Business KYC (KYB) now captures who the business says it is, alongside the documents that
 * prove it: its legal name and whether it's an established company (RCCM required) or a startup
 * (3-month proof of address required instead — see business_dashboard/kyc_controller.ts).
 *
 * Nullable: user/agent verifications never carry these, nor do business rows submitted before.
 */
export default class extends BaseSchema {
  protected tableName = 'kyc_verifications'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('business_name').nullable().comment('Legal business name declared at KYB')
      table
        .string('business_type')
        .nullable()
        .comment('company | startup — decides which business documents are required')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('business_name')
      table.dropColumn('business_type')
    })
  }
}
