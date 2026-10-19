import { RemittanceService } from '#services/remittances/remittance_service'

/**
 * Refunds international transfers nobody collected within REMITTANCE_TTL_DAYS. Scheduled in
 * app/queue/workers.ts; `node ace remittance:expire` runs it by hand.
 */
export async function handleExpireRemittances(): Promise<{ expired: number }> {
  const expired = await RemittanceService.expireStale()
  if (expired > 0) {
    console.log(`[remittance] refunded ${expired} expired transfer${expired > 1 ? 's' : ''}`)
  }
  return { expired }
}
