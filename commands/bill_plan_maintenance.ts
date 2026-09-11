import { BaseCommand } from '@adonisjs/core/ace'
import { PlanService } from '#services/business/plan_service'

/**
 * Charges every business whose plan has a recurring maintenance_price and whose
 * plan_next_maintenance_billing_at is due. Not run automatically by anything in this app —
 * schedule it externally via cron, e.g. daily: cd /path/to/app && node ace plans:bill-maintenance
 *
 * A business that fails (insufficient wallet balance) is marked plan_payment_status='past_due'
 * and its due date is left in the past, so the next run retries automatically — no grace period
 * or auto-downgrade is implemented yet.
 */
export default class BillPlanMaintenance extends BaseCommand {
  static commandName = 'plans:bill-maintenance'
  static description = "Charge every business's due recurring plan maintenance fee"

  static options = {
    startApp: true,
  }

  async run() {
    const result = await PlanService.chargeDueMaintenanceFees()
    this.logger.info(`Charged ${result.charged}, past due ${result.pastDue}`)
  }
}
