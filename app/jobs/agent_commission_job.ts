import { AgentCommissionService } from '#services/agents/agent_commission_service'

/**
 * Pays agents their daily volume commission. Scheduled hourly (app/queue/workers.ts): each run
 * settles the days that are due and skips the ones already paid, so a missed or crashed run is
 * caught up by the next one.
 */
export async function handleAgentCommissions(): Promise<void> {
  const results = await AgentCommissionService.payDueDays()
  if (results.length > 0) {
    console.log(`✓ Agent commissions: ${results.length} payout(s) settled`)
  }
}
