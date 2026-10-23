import { LikilibaCycleService } from '#services/likiliba/cycle_service'

/**
 * Runs the likiliba calendar: reminders, automatic debits, lateness, caution covers, penalties,
 * escalations and payouts. Scheduled every few minutes (app/queue/workers.ts); each pass only does
 * what is due, so a missed run is caught up by the next one.
 */
export async function handleLikilibaCycle(): Promise<void> {
  const result = await LikilibaCycleService.tick()
  if (result.failures.length > 0) {
    console.error(`✗ Likiliba: ${result.failures.length} group(s) failed this pass`)
  }
}
