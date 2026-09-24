import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import {
  LegacyMigrationService,
  MemberMigrationRecord,
} from '#services/lending/legacy_migration_service'

const migrationRecordSchema = vine.object({
  full_name: vine.string().trim().minLength(2).maxLength(120),
  phone: vine.string().trim().optional(),
  email: vine.string().trim().email().optional(),
  national_id: vine.string().trim().optional(),
  opening_savings_balance: vine.string().regex(/^\d+$/),
  locked_collateral: vine.string().regex(/^\d+$/).optional(),
  currency_code: vine.string().trim().fixedLength(3),
  group_name: vine.string().trim().optional(),
  existing_loan: vine
    .object({
      product_id: vine.number().positive(),
      original_principal: vine.string().regex(/^\d+$/),
      principal_outstanding: vine.string().regex(/^\d+$/),
      interest_outstanding: vine.string().regex(/^\d+$/),
      term_months: vine.number().min(1).max(120),
      remaining_months: vine.number().min(1).max(120),
      interest_rate_bps: vine.number().min(0).max(10000),
      interest_method: vine.enum(['flat', 'declining'] as const),
      first_future_due_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
})

const migrationBatchValidator = vine.compile(
  vine.object({
    records: vine.array(migrationRecordSchema).minLength(1).maxLength(1000),
  })
)

export default class ImfMigrationController {
  /** POST /api/v1/business/dashboard/imf/migration/validate — Dry run validation */
  async validate({ request, response }: HttpContext) {
    const payload = await request.validateUsing(migrationBatchValidator)
    const result = LegacyMigrationService.validateBatch(
      payload.records as unknown as MemberMigrationRecord[]
    )

    return response.ok({
      data: {
        valid: result.valid,
        total_members: result.total_members,
        total_opening_savings: result.total_opening_savings.toString(),
        total_opening_loans: result.total_opening_loans.toString(),
        errors: result.errors,
      },
    })
  }

  /** POST /api/v1/business/dashboard/imf/migration/commit — Execute the migration */
  async commit({ business, auth, request, correlationId, response }: HttpContext) {
    const payload = await request.validateUsing(migrationBatchValidator)
    const staffId = auth.user ? auth.user.id : 1

    try {
      const result = await LegacyMigrationService.commitBatch(
        business.id,
        staffId,
        payload.records as unknown as MemberMigrationRecord[],
        correlationId
      )

      return response.created({ data: result })
    } catch (error) {
      return response.badRequest({
        message: (error as Error).message,
        code: 'E_MIGRATION_FAILED',
      })
    }
  }
}
