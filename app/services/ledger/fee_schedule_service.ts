import FeeSchedule from '#models/fee_schedule'

/**
 * Single place every fee-charging service reads its percentage from — replaces the hardcoded
 * env-var-backed config/mobile_money.ts and config/cards.ts fee values (never admin-editable) so
 * an internal user can change a rate at runtime via admin/fee_schedules_controller.ts. See
 * migration 1793500000000_create_fee_schedules_table.ts for the seeded operation types.
 *
 * No caching, deliberately — same choice as PlanService and
 * LedgerService.getOrCreatePlatformAccount(): a direct indexed read per call, not a premature
 * optimization for a table with a handful of rows.
 */
export class FeeScheduleService {
  static async getFeePercent(operationType: string): Promise<number> {
    const schedule = await FeeSchedule.findBy('operation_type', operationType)
    return schedule ? Number(schedule.feePercent) : 0
  }
}
