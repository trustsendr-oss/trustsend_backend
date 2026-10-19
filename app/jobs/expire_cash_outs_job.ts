import { CashOutService } from '#services/transactions/cash_out_service'

/**
 * Closes cash-out reservations that were never paid out.
 *
 * The funds of a lapsed reservation already stop counting as held at the cutoff (see
 * CashOutHoldService), so a late run never blocks anyone's money. This job only makes the status
 * catch up, so neither the customer nor the agent keeps seeing a withdrawal that can no longer
 * happen. Scheduled in app/queue/workers.ts; `node ace cash-out:expire` runs it by hand.
 */
export async function handleExpireCashOuts(): Promise<{ expired: number }> {
  const expired = await CashOutService.expireStale()
  if (expired > 0) {
    console.log(`[cash-out] expired ${expired} stale reservation${expired > 1 ? 's' : ''}`)
  }
  return { expired }
}
